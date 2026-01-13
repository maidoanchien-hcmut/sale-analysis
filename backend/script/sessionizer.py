import json
import re
from datetime import datetime, timedelta, timezone
import os
import argparse
import sys


def anonymize(text):
    phone_pattern = r'(?:\+84|84|0)(?:[\s\.\-]?\d{1,3}){2,3}[\s\.\-]?\d{3,4}\b'
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'

    text = re.sub(phone_pattern, '[SDT]', text)
    text = re.sub(email_pattern, '[EMAIL]', text)

    return text


def process_chat_file(file_path, session_threshold_hours=24):
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found.", file=sys.stderr)
        return None
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError:
        print("Error: Invalid JSON format.", file=sys.stderr)
        return None

    messages = data.get('messages', [])
    if not messages:
        return []

    messages.sort(key=lambda x: x['timestamp'])
    sessions = []
    current_session = []
    last_time = None

    for msg in messages:
        ts_str = msg['timestamp'].replace('Z', '+00:00')
        current_time = datetime.fromisoformat(ts_str)

        cleaned_content = anonymize(msg.get('content', ''))
        cleaned_msg = msg.copy()
        cleaned_msg['content'] = cleaned_content

        is_new_session = False
        if last_time:
            time_diff = current_time - last_time
            if time_diff > timedelta(hours=session_threshold_hours):
                is_new_session = True

        if is_new_session and current_session:
            sessions.append(current_session)
            current_session = []

        current_session.append(cleaned_msg)
        last_time = current_time

    if current_session:
        sessions.append(current_session)

    formatted_output = []

    file_base = os.path.splitext(os.path.basename(file_path))[0]
    unique_prefix = f"{file_base}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"

    for idx, sess in enumerate(sessions):
        session_id = f"{unique_prefix}_sess_{idx+1}"
        formatted_output.append({
            "session_id": session_id,
            "start_time": sess[0]['timestamp'],
            "end_time": sess[-1]['timestamp'],
            "message_count": len(sess),
            "messages": sess
        })

    return formatted_output


# def main():
#     parser = argparse.ArgumentParser(description="Chat Log Sessionizer")
#     parser.add_argument('input_file', help="Path to input JSON file")

#     args = parser.parse_args()

#     print(f"Processing: {args.input_file}", file=sys.stderr)
#     result = process_chat_file(args.input_file)

#     if result is None:
#         sys.exit(1)

#     script_dir = os.path.dirname(os.path.abspath(__file__))
#     output_dir = os.path.normpath(os.path.join(
#         script_dir, '..', 'json', 'sessionized'))
#     os.makedirs(output_dir, exist_ok=True)

#     base_name = os.path.basename(args.input_file)
#     name, ext = os.path.splitext(base_name)
#     if not ext:
#         ext = '.json'

#     candidate = f"{name}_sessionized{ext}"
#     output_path = os.path.join(output_dir, candidate)

#     if os.path.exists(output_path):
#         count = 0
#         while True:
#             candidate = f"{name}_sessionized_{count}{ext}"
#             candidate_path = os.path.join(output_dir, candidate)
#             if not os.path.exists(candidate_path):
#                 output_path = candidate_path
#                 break
#             count += 1
#     try:
#         with open(output_path, 'w', encoding='utf-8') as f:
#             json.dump(result, f, indent=2, ensure_ascii=False)
#     except Exception as e:
#         print(f"Error: Failed to write output file: {e}", file=sys.stderr)
#         sys.exit(1)


# if __name__ == "__main__":
#     main()
