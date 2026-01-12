import json
import re
from datetime import datetime, timedelta
import os
import argparse
import sys


def anonymize_phone(text):
    phone_pattern = r'(?:\+84|84|0)(?:[\s\.\-]?\d{1,3}){2,3}[\s\.\-]?\d{3,4}\b'
    return re.sub(phone_pattern, '[SDT]', text)


def anonymize_email(text):
    return re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', text)


def clean_data(text):
    text = anonymize_phone(text)
    text = anonymize_email(text)
    return text


def process_chat_file(file_path, session_threshold_hours=24):
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found.")
        return None

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError:
        print("Error: Invalid JSON format.")
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

        cleaned_content = clean_data(msg.get('content', ''))

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
    for idx, sess in enumerate(sessions):
        formatted_output.append({
            "session_id": f"sess_{idx+1}",
            "start_time": sess[0]['timestamp'],
            "end_time": sess[-1]['timestamp'],
            "message_count": len(sess),
            "messages": sess
        })

    return formatted_output


def main():
    parser = argparse.ArgumentParser(description="Chat Log Sessionizer")
    parser.add_argument('input_file', help="Path to input JSON file")
    parser.add_argument('--output', required=True,
                        help="Path to output JSON file")

    args = parser.parse_args()

    print(f"Processing: {args.input_file}")
    result = process_chat_file(args.input_file)

    if result is not None:
        os.makedirs(os.path.dirname(args.output), exist_ok=True)

        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        print(f"Success: Saved {len(result)} sessions to {args.output}")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
