import json
import logging
from flask import Blueprint, jsonify, request
from auth import get_api

reminders_bp = Blueprint("reminders", __name__)
_log = logging.getLogger("reminders")

# CloudKit zone and container for Reminders
_CK_CONTAINER = "com.apple.reminders"
_CK_ZONE = "Reminders"


def _ck_base_url(api):
    """Get the CloudKit database base URL."""
    ws = getattr(api, '_webservices', {})
    ck_url = ws.get('ckdatabasews', {}).get('url')
    if not ck_url:
        return None
    return f"{ck_url}/database/1/{_CK_CONTAINER}/production/private"


def _ck_query(api, record_type):
    """Query CloudKit for records of a given type in the Reminders zone."""
    base = _ck_base_url(api)
    if not base:
        return None
    body = {
        "query": {"recordType": record_type},
        "zoneID": {"zoneName": _CK_ZONE},
    }
    resp = api.session.post(f"{base}/records/query", params=api.params, json=body)
    resp.raise_for_status()
    return resp.json()


def _ck_lookup(api, record_names):
    """Lookup CloudKit records by their recordNames."""
    base = _ck_base_url(api)
    if not base:
        return None
    body = {
        "records": [
            {
                "recordName": name,
                "recordType": "Reminder",
            }
            for name in record_names
        ],
        "zoneID": {"zoneName": _CK_ZONE},
    }
    resp = api.session.post(f"{base}/records/lookup", params=api.params, json=body)
    resp.raise_for_status()
    return resp.json()


def _ck_field(record, name, default=None):
    """Extract a field value from a CloudKit record."""
    fields = record.get("fields", {})
    field = fields.get(name)
    if field is None:
        return default
    return field.get("value", default)


def _parse_ck_document(record, field_name):
    """Parse a CloudKit document field (TitleDocument/NotesDocument).

    These are gzip-compressed, protobuf-encoded attributed strings.
    """
    fields = record.get("fields", {})
    field = fields.get(field_name)
    if not field:
        return ""
    value = field.get("value")
    if not value:
        return ""
    if isinstance(value, dict):
        return value.get("text", "")
    if isinstance(value, str):
        try:
            import base64
            import gzip
            import zlib
            compressed = base64.b64decode(value)
            # Try gzip first, then zlib
            try:
                decompressed = gzip.decompress(compressed)
            except gzip.BadGzipFile:
                decompressed = zlib.decompress(compressed)
            return _extract_text_from_protobuf(decompressed)
        except Exception as e:
            _log.error(f"[CK] Failed to parse {field_name}: {e}")
            return value
    return str(value)


def _extract_text_from_protobuf(data):
    """Extract plain text from a protobuf-encoded attributed string.

    Apple Reminders TitleDocument/NotesDocument uses a nested protobuf
    structure. The text is typically at: outer.field2.field3.field2.
    We recursively parse all length-delimited fields to find UTF-8 text.
    """
    try:
        texts = _parse_protobuf_strings(data, depth=0)
        if texts:
            # Filter out very short or control-char strings
            real_texts = [t for t in texts if len(t) > 0 and not t.startswith('\x00')]
            if real_texts:
                return max(real_texts, key=len)
        return ""
    except Exception as e:
        _log.error(f"[CK] Protobuf parse error: {e}")
        return ""


def _parse_protobuf_strings(data, depth=0, max_depth=5):
    """Recursively parse protobuf data and extract all UTF-8 text strings."""
    if depth > max_depth:
        return []
    texts = []
    i = 0
    while i < len(data):
        # Read tag byte(s) - varint encoded (field_num << 3 | wire_type)
        tag = 0
        shift = 0
        while i < len(data):
            b = data[i]
            i += 1
            tag |= (b & 0x7F) << shift
            shift += 7
            if not (b & 0x80):
                break
        else:
            break

        wire_type = tag & 0x07
        field_num = tag >> 3

        if wire_type == 0:  # varint
            while i < len(data) and data[i] & 0x80:
                i += 1
            if i < len(data):
                i += 1
        elif wire_type == 2:  # length-delimited
            # Read varint length
            length = 0
            shift = 0
            while i < len(data):
                b = data[i]
                i += 1
                length |= (b & 0x7F) << shift
                shift += 7
                if not (b & 0x80):
                    break
            else:
                break

            if length < 0 or i + length > len(data):
                break
            chunk = data[i:i + length]
            i += length

            # Try to decode as UTF-8 text first
            try:
                text = chunk.decode("utf-8")
                printable = sum(1 for c in text if c.isprintable() or c in '\n\r\t')
                if printable > len(text) * 0.7 and len(text) > 0:
                    texts.append(text)
            except UnicodeDecodeError:
                pass

            # Also recurse into it as a nested protobuf message
            if len(chunk) > 1:
                nested = _parse_protobuf_strings(chunk, depth + 1, max_depth)
                texts.extend(nested)
        elif wire_type == 5:  # 32-bit fixed
            i += 4
        elif wire_type == 1:  # 64-bit fixed
            i += 8
        else:
            break  # unknown wire type, stop parsing
    return texts


def _parse_title_document(record):
    """Parse the TitleDocument field from a CloudKit reminder."""
    return _parse_ck_document(record, "TitleDocument")


def _parse_notes_document(record):
    """Parse the NotesDocument field from a CloudKit reminder."""
    return _parse_ck_document(record, "NotesDocument")


def _ck_timestamp_to_datetime(ts, is_all_day=False):
    """Convert a CloudKit timestamp (ms since epoch) to date or datetime string.

    Returns "YYYY-MM-DD" for all-day reminders, "YYYY-MM-DDTHH:MM" for timed ones.
    """
    if ts is None:
        return None
    try:
        from datetime import datetime, timezone
        # All-day check uses UTC (iCloud stores all-day as midnight UTC)
        dt_utc = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        if is_all_day or (dt_utc.hour == 0 and dt_utc.minute == 0):
            return dt_utc.strftime("%Y-%m-%d")
        # Timed reminders use local time for correct display
        dt_local = datetime.fromtimestamp(ts / 1000)
        return dt_local.strftime("%Y-%m-%dT%H:%M")
    except (ValueError, TypeError, OSError):
        return None


def _fetch_cloudkit(api):
    """Fetch reminders via CloudKit API (for upgraded accounts)."""
    base = _ck_base_url(api)
    if not base:
        return None

    # Query all lists (recordType = "List")
    lists_data = _ck_query(api, "Lists")
    if lists_data is None:
        return None

    # Build list info: extract Name and ReminderIDs from each list
    lists_info = []  # [(list_name, [reminder_ids])]
    for rec in lists_data.get("records", []):
        name = _ck_field(rec, "Name", "").strip()
        deleted = _ck_field(rec, "Deleted", 0)
        if deleted:
            continue
        if not name:
            name = rec.get("recordName", "未命名")

        # ReminderIDs is a JSON string array
        reminder_ids_str = _ck_field(rec, "ReminderIDs", "[]")
        try:
            reminder_ids = json.loads(reminder_ids_str)
        except (json.JSONDecodeError, TypeError):
            reminder_ids = []

        _log.info(f"[CK] List '{name}': {len(reminder_ids)} reminders")
        lists_info.append((name, reminder_ids))

    # Fetch reminders for each list via lookup
    result = {}
    for list_name, reminder_ids in lists_info:
        items = []
        if reminder_ids:
            # Lookup in batches (CloudKit may limit batch size)
            batch_size = 200
            for i in range(0, len(reminder_ids), batch_size):
                batch = reminder_ids[i:i + batch_size]
                # Record names for reminders: "Reminder/{uuid}"
                record_names = [f"Reminder/{rid}" for rid in batch]
                try:
                    lookup_data = _ck_lookup(api, record_names)
                except Exception as e:
                    _log.error(f"[CK] Lookup error for '{list_name}': {e}")
                    continue

                for rec in lookup_data.get("records", []):
                    # Skip records with errors (deleted, etc.)
                    if "recordName" not in rec or "fields" not in rec:
                        continue

                    # Skip deleted reminders
                    if _ck_field(rec, "Deleted", 0):
                        continue

                    title = _parse_title_document(rec)
                    notes = _parse_notes_document(rec)
                    completed = _ck_field(rec, "Completed", 0)
                    completion_date = _ck_field(rec, "CompletionDate")
                    due_date_ts = _ck_field(rec, "DueDate")
                    priority = _ck_field(rec, "Priority", 0)
                    is_all_day = bool(_ck_field(rec, "DueDateIsAllDay", 0))
                    flagged = bool(_ck_field(rec, "Flagged", 0))

                    items.append({
                        "title": title,
                        "description": notes,
                        "due_date": _ck_timestamp_to_datetime(due_date_ts, is_all_day),
                        "completed": bool(completed),
                        "priority": priority or 0,
                        "flagged": flagged,
                        "recordName": rec.get("recordName", ""),
                        "recordChangeTag": rec.get("recordChangeTag", ""),
                    })

                    # Log first reminder for debugging
                    if len(items) == 1 and i == 0:
                        fields = rec.get("fields", {})
                        _log.info(f"[CK] First reminder fields: {list(fields.keys())}")
                        _log.info(f"[CK] TitleDocument raw: {fields.get('TitleDocument')}")
                        _log.info(f"[CK] First parsed title: '{title}'")

        result[list_name] = items
        _log.info(f"[CK] List '{list_name}': fetched {len(items)} items")

    return result


def _fetch_legacy(api):
    """Fetch reminders via legacy CalDAV API (/rd/startup)."""
    api.reminders.refresh()
    result = {}
    for collection_name, reminders_list in api.reminders.lists.items():
        items = []
        for reminder in reminders_list:
            due_date = _format_due_date_legacy(reminder)
            items.append({
                "title": reminder.get("title", ""),
                "description": reminder.get("description", ""),
                "due_date": due_date,
                "completed": reminder.get("completedDate") is not None,
                "priority": reminder.get("priority", 0),
                "flagged": bool(reminder.get("flagged", False)),
            })
        result[collection_name] = items
    return result


def _format_due_date_legacy(reminder):
    """Extract and format due date from a legacy reminder object."""
    due = reminder.get("dueDate")
    if due:
        try:
            if isinstance(due, (list, tuple)) and len(due) >= 3:
                date_str = f"{due[0]:04d}-{due[1]:02d}-{due[2]:02d}"
                if len(due) >= 5 and (due[3] or due[4]):
                    return f"{date_str}T{due[3]:02d}:{due[4]:02d}"
                return date_str
            elif hasattr(due, "strftime"):
                if due.hour or due.minute:
                    return due.strftime("%Y-%m-%dT%H:%M")
                return due.strftime("%Y-%m-%d")
        except (IndexError, ValueError, TypeError):
            pass
    due_components = reminder.get("dueDateComponents")
    if due_components:
        try:
            year = due_components.get("year")
            month = due_components.get("month")
            day = due_components.get("day")
            if year and month and day:
                hour = due_components.get("hour")
                minute = due_components.get("minute")
                date_str = f"{year:04d}-{month:02d}-{day:02d}"
                if hour is not None and minute is not None and (hour or minute):
                    return f"{date_str}T{hour:02d}:{minute:02d}"
                return date_str
        except (ValueError, TypeError):
            pass
    return None


def _update_resolution_token_map(current_record, changed_field_keys):
    """Update the ResolutionTokenMap CRDT tokens for changed fields.

    Apple Reminders uses ResolutionTokenMap for CRDT-based sync resolution.
    When a field changes, its entry in the map must be updated with an
    incremented counter and the current Apple timestamp, otherwise other
    Apple devices will ignore the change.
    """
    import uuid
    import time

    fields = current_record.get("fields", {})
    rtm_field = fields.get("ResolutionTokenMap")
    if not rtm_field:
        return None

    rtm_str = rtm_field.get("value", "{}")
    try:
        rtm = json.loads(rtm_str)
    except (json.JSONDecodeError, TypeError):
        return None

    token_map = rtm.get("map", {})

    # Apple timestamp = Unix timestamp - 978307200 (seconds since 2001-01-01)
    apple_now = time.time() - 978307200
    replica_id = str(uuid.uuid4()).upper()

    # Map CloudKit field names to ResolutionTokenMap keys
    field_to_token_key = {
        "Completed": "completed",
        "CompletionDate": "completionDate",
        "LastModifiedDate": "lastModifiedDate",
    }

    for field_name in changed_field_keys:
        token_key = field_to_token_key.get(field_name, field_name)
        if token_key in token_map:
            token_map[token_key]["counter"] = token_map[token_key].get("counter", 0) + 1
            token_map[token_key]["modificationTime"] = apple_now
            token_map[token_key]["replicaID"] = replica_id
        else:
            token_map[token_key] = {
                "counter": 1,
                "modificationTime": apple_now,
                "replicaID": replica_id,
            }

    # Always bump lastModifiedDate token
    if "lastModifiedDate" in token_map and "LastModifiedDate" not in changed_field_keys:
        token_map["lastModifiedDate"]["counter"] = token_map["lastModifiedDate"].get("counter", 0) + 1
        token_map["lastModifiedDate"]["modificationTime"] = apple_now
        token_map["lastModifiedDate"]["replicaID"] = replica_id

    rtm["map"] = token_map
    return json.dumps(rtm)


def _ck_modify(api, record_name, record_type, fields):
    """Modify a CloudKit record's fields.

    Always fetches the latest recordChangeTag first to avoid conflicts.
    Also updates ResolutionTokenMap for proper Apple device sync.
    """
    base = _ck_base_url(api)
    if not base:
        return None

    # Step 1: Lookup the record to get the latest recordChangeTag
    _log.info(f"[CK_MODIFY] Looking up {record_name} to get latest recordChangeTag")
    lookup_resp = _ck_lookup(api, [record_name])
    if not lookup_resp:
        _log.error("[CK_MODIFY] Lookup failed")
        return None

    lookup_records = lookup_resp.get("records", [])
    if not lookup_records:
        _log.error(f"[CK_MODIFY] Record {record_name} not found in lookup")
        return None

    current_record = lookup_records[0]
    if "serverErrorCode" in current_record:
        _log.error(f"[CK_MODIFY] Lookup error: {current_record}")
        return None

    record_change_tag = current_record.get("recordChangeTag")
    _log.info(f"[CK_MODIFY] Got recordChangeTag: {record_change_tag}")

    # Step 2: Update ResolutionTokenMap for changed fields
    updated_rtm = _update_resolution_token_map(current_record, list(fields.keys()))
    if updated_rtm:
        fields["ResolutionTokenMap"] = {"value": updated_rtm, "type": "STRING"}
        _log.info(f"[CK_MODIFY] Updated ResolutionTokenMap for fields: {list(fields.keys())}")

    # Step 3: Modify with the latest recordChangeTag
    record = {
        "recordName": record_name,
        "recordType": record_type,
        "fields": fields,
    }
    if record_change_tag:
        record["recordChangeTag"] = record_change_tag

    body = {
        "operations": [
            {
                "operationType": "update",
                "record": record,
            }
        ],
        "zoneID": {"zoneName": _CK_ZONE},
    }

    _log.info(f"[CK_MODIFY] Sending modify request for {record_name}")
    resp = api.session.post(f"{base}/records/modify", params=api.params, json=body)
    _log.info(f"[CK_MODIFY] HTTP status: {resp.status_code}")
    resp.raise_for_status()
    result = resp.json()

    # Step 4: Check for record-level errors in the response
    result_records = result.get("records", [])
    for rec in result_records:
        if "serverErrorCode" in rec:
            error_code = rec.get("serverErrorCode")
            reason = rec.get("reason", "unknown")
            _log.error(f"[CK_MODIFY] Server error: {error_code} - {reason}")
            return {"error": f"CloudKit error: {error_code} - {reason}"}
        _log.info(f"[CK_MODIFY] Success. New recordChangeTag: {rec.get('recordChangeTag')}")

    return result


@reminders_bp.route("/api/reminders/complete", methods=["POST"])
def complete_reminder():
    """Mark a reminder as completed via CloudKit."""
    api = get_api()
    if api is None:
        return jsonify({"error": "Not authenticated"}), 401

    data = request.get_json()
    if not data or "recordName" not in data:
        return jsonify({"error": "recordName is required"}), 400

    record_name = data["recordName"]

    try:
        from datetime import datetime, timezone
        now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)

        fields = {
            "Completed": {"value": 1, "type": "NUMBER_INT64"},
            "CompletionDate": {"value": now_ms, "type": "TIMESTAMP"},
        }

        result = _ck_modify(api, record_name, "Reminder", fields)
        if result is None:
            return jsonify({"error": "CloudKit not available"}), 500
        if isinstance(result, dict) and "error" in result:
            return jsonify(result), 500

        return jsonify({"status": "ok"})
    except Exception as e:
        _log.error(f"[COMPLETE] Error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@reminders_bp.route("/api/reminders/uncomplete", methods=["POST"])
def uncomplete_reminder():
    """Mark a completed reminder as incomplete via CloudKit."""
    api = get_api()
    if api is None:
        return jsonify({"error": "Not authenticated"}), 401

    data = request.get_json()
    if not data or "recordName" not in data:
        return jsonify({"error": "recordName is required"}), 400

    record_name = data["recordName"]

    try:
        fields = {
            "Completed": {"value": 0, "type": "NUMBER_INT64"},
        }

        result = _ck_modify(api, record_name, "Reminder", fields)
        if result is None:
            return jsonify({"error": "CloudKit not available"}), 500
        if isinstance(result, dict) and "error" in result:
            return jsonify(result), 500

        return jsonify({"status": "ok"})
    except Exception as e:
        _log.error(f"[UNCOMPLETE] Error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@reminders_bp.route("/api/reminders", methods=["GET"])
def fetch_reminders():
    """Fetch all reminder lists and their items from iCloud."""
    api = get_api()
    if api is None:
        return jsonify({"error": "Not authenticated"}), 401

    try:
        # Try CloudKit API first (for accounts upgraded to new reminders)
        result = _fetch_cloudkit(api)
        if result is not None:
            _log.info(f"[REMINDERS] CloudKit: {len(result)} lists")
            return jsonify({"lists": result})

        # Fall back to legacy API
        _log.info("[REMINDERS] CloudKit unavailable, using legacy API")
        result = _fetch_legacy(api)
        return jsonify({"lists": result})
    except Exception as e:
        _log.error(f"[REMINDERS] Error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
