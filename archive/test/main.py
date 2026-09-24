from flask import Flask, request, jsonify, render_template_string
from datetime import datetime
from threading import Lock

app = Flask(__name__)

# Store incoming telemetry
telemetry_history = []

# Request counter
request_count = 0

# Protect shared data when Flask handles multiple requests
lock = Lock()


# ---------------------------------------------------------
# Commands sent to ESP32
# ---------------------------------------------------------

COMMAND_A = {
    "ev1_charge": True,
    "ev2_charge": False,
    "ev1_source": 1,
    "ev2_source": 0
}

COMMAND_B = {
    "ev1_charge": False,
    "ev2_charge": True,
    "ev1_source": 0,
    "ev2_source": 1
}


def get_command(count):
    """
    Alternate commands based on request count.

    Requests 1-10   -> COMMAND_A
    Requests 11-25  -> COMMAND_B
    Requests 26-35  -> COMMAND_A
    Requests 36-50  -> COMMAND_B
    ...and so on.

    This gives you roughly 10-15 requests per command.
    """

    cycle_position = (count - 1) % 25

    if cycle_position < 10:
        return COMMAND_A

    return COMMAND_B


# ---------------------------------------------------------
# ESP32 -> Python
# Python -> ESP32
# ---------------------------------------------------------

@app.route("/api/telemetry", methods=["POST"])
def telemetry():

    global request_count

    payload = request.get_json(silent=True)

    if payload is None:
        return jsonify({
            "error": "Invalid JSON payload"
        }), 400

    with lock:
        request_count += 1
        current_count = request_count

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Save incoming payload for the HTML page
        telemetry_history.append({
            "request": current_count,
            "received_at": timestamp,
            "payload": payload
        })

        # Prevent unlimited memory usage
        if len(telemetry_history) > 1000:
            telemetry_history.pop(0)

    # Select command
    command = get_command(current_count)

    # Print incoming request
    print("\n========================================")
    print(f"Request #{current_count}")
    print(f"Received: {timestamp}")
    print("ESP32 -> Command Center")
    print(payload)

    print("\nCommand Center -> ESP32")
    print(command)
    print("========================================")

    # Send command back to ESP32
    return jsonify(command)


# ---------------------------------------------------------
# HTML monitoring page
# ---------------------------------------------------------

HTML_PAGE = """
<!DOCTYPE html>
<html>
<head>
    <title>ESP32 EMS Telemetry Monitor</title>

    <meta http-equiv="refresh" content="2">

    <style>
        body {
            font-family: Arial, sans-serif;
            background: #f4f4f4;
            margin: 20px;
        }

        h1 {
            margin-bottom: 5px;
        }

        .status {
            margin-bottom: 20px;
            color: #555;
        }

        .request {
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 12px;
        }

        .request-number {
            font-size: 18px;
            font-weight: bold;
        }

        .time {
            color: #777;
            font-size: 13px;
        }

        pre {
            background: #222;
            color: #eee;
            padding: 12px;
            border-radius: 5px;
            overflow-x: auto;
        }
    </style>
</head>

<body>

<h1>ESP32 EMS Telemetry Monitor</h1>

<div class="status">
    Total requests received: <b>{{ request_count }}</b>
</div>

{% if telemetry_history %}

    {% for item in telemetry_history %}

    <div class="request">

        <div class="request-number">
            Request #{{ item.request }}
        </div>

        <div class="time">
            Received: {{ item.received_at }}
        </div>

        <pre>{{ item.payload | tojson(indent=2) }}</pre>

    </div>

    {% endfor %}

{% else %}

    <p>No telemetry received yet.</p>

{% endif %}

</body>
</html>
"""


@app.route("/", methods=["GET"])
def index():

    with lock:
        history = list(telemetry_history)
        count = request_count

    return render_template_string(
        HTML_PAGE,
        telemetry_history=history,
        request_count=count
    )


# ---------------------------------------------------------
# Optional API to see current request count
# ---------------------------------------------------------

@app.route("/api/status", methods=["GET"])
def status():

    with lock:
        return jsonify({
            "requests_received": request_count
        })


# ---------------------------------------------------------
# Start server
# ---------------------------------------------------------

if __name__ == "__main__":

    print()
    print("==============================================")
    print(" ESP32 EMS Command Center")
    print("==============================================")
    print()
    print("Telemetry endpoint:")
    print("POST http://<PC-IP>:5000/api/telemetry")
    print()
    print("Monitoring page:")
    print("http://<PC-IP>:5000/")
    print()
    print("Starting server...")
    print()

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,
        threaded=True
    )