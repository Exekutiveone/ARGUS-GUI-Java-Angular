#!/usr/bin/env python3
# coding: ascii

"""
ARES Webinterface (ASCII only strings)
--------------------------------------
- PCA9685 control (servos/LEDs) via I2C mux
- CSI + USB camera streams
- MLX90640 thermal stream with smoothing and min/max text
- Sensor loop (QMC5883L, BMI160/MPU9250, BME280/BMP280)
- Web UI: text values, SVG compass, Three.js 3D cube for IMU
- With basic smoothing / filtering for stable readings
"""

import subprocess
import cv2
import time
import threading
import math
import numpy as np
from flask import Flask, Response, render_template_string, request, jsonify
from smbus2 import SMBus
import board, busio
from adafruit_mlx90640 import MLX90640

# -------- I2C / MUX / addresses ----------
I2C_BUS = 1
MUX_ADDR = 0x70
PCA_ADDR = 0x40
MLX_ADDR = 0x33
CH_THERMAL = 1
CH_BME = 4
CH_COMPASS = 6
CH_IMU = 7

# -------- global variables ----------
thermal_frame = np.zeros((24, 32), dtype=float)

sensor_data = {
    "thermal": {"tmin": None, "tmax": None},
    "bme": {
        "raw_t": None,
        "raw_p": None,
        "raw_h": None,
        "temp_c": None,
        "pressure_hpa": None,
        "humidity_pct": None,
    },
    "mag": {"x": None, "y": None, "z": None, "heading_deg": None},
    "accel": {"x": None, "y": None, "z": None},
    "gyro": {"x": None, "y": None, "z": None},
}

smooth_state = {
    "thermal_min": None,
    "thermal_max": None,
    "temp_c": None,
    "pressure_hpa": None,
    "humidity_pct": None,
    "heading_deg": None,
    "accel_x": None,
    "accel_y": None,
    "accel_z": None,
    "gyro_x": None,
    "gyro_y": None,
    "gyro_z": None,
}

# -------- helper: smoothing ----------
def smooth_val(old, new, alpha=0.2):
    """exponential moving average"""
    if new is None:
        return old
    if old is None:
        return new
    return old + alpha * (new - old)

# -------- hardware helpers ----------
def set_mux_channel(bus, channel):
    bus.write_byte(MUX_ADDR, 1 << channel)
    time.sleep(0.02)

def twos_complement(val, bits):
    if val & (1 << (bits - 1)):
        val -= 1 << bits
    return val

def set_pwm(bus, channel, value):
    reg_base = 0x06 + 4 * channel
    bus.write_byte_data(PCA_ADDR, reg_base + 0, 0 & 0xFF)
    bus.write_byte_data(PCA_ADDR, reg_base + 1, 0 >> 8)
    bus.write_byte_data(PCA_ADDR, reg_base + 2, value & 0xFF)
    bus.write_byte_data(PCA_ADDR, reg_base + 3, value >> 8)

def servo_deg_to_pwm(deg):
    d = max(0, min(180, int(deg)))
    return int(820 + (d / 180.0) * (1638 - 820))

def led_pct_to_pwm(pct):
    p = max(0, min(100, int(pct)))
    return int((p / 100.0) * 4095)

BME_ADDR = 0x76
_bme_calibration = None
_bme_t_fine = 0.0

def _read_u16(data, index):
    return data[index] | (data[index + 1] << 8)

def _read_s16(data, index):
    value = _read_u16(data, index)
    if value & 0x8000:
        value -= 0x10000
    return value

def _ensure_bme_calibration(bus, addr=BME_ADDR):
    global _bme_calibration
    if _bme_calibration is not None:
        return
    try:
        calib = {}
        coeffs = bus.read_i2c_block_data(addr, 0x88, 26)
        calib["dig_T1"] = _read_u16(coeffs, 0)
        calib["dig_T2"] = _read_s16(coeffs, 2)
        calib["dig_T3"] = _read_s16(coeffs, 4)
        calib["dig_P1"] = _read_u16(coeffs, 6)
        calib["dig_P2"] = _read_s16(coeffs, 8)
        calib["dig_P3"] = _read_s16(coeffs, 10)
        calib["dig_P4"] = _read_s16(coeffs, 12)
        calib["dig_P5"] = _read_s16(coeffs, 14)
        calib["dig_P6"] = _read_s16(coeffs, 16)
        calib["dig_P7"] = _read_s16(coeffs, 18)
        calib["dig_P8"] = _read_s16(coeffs, 20)
        calib["dig_P9"] = _read_s16(coeffs, 22)
        calib["dig_H1"] = bus.read_byte_data(addr, 0xA1)
        coeffs_h = bus.read_i2c_block_data(addr, 0xE1, 7)
        calib["dig_H2"] = _read_s16(coeffs_h, 0)
        calib["dig_H3"] = coeffs_h[2]
        calib["dig_H4"] = (coeffs_h[3] << 4) | (coeffs_h[4] & 0x0F)
        calib["dig_H5"] = (coeffs_h[5] << 4) | (coeffs_h[4] >> 4)
        calib["dig_H6"] = coeffs_h[6] if coeffs_h[6] < 128 else coeffs_h[6] - 256
        bus.write_byte_data(addr, 0xF2, 0x01)
        bus.write_byte_data(addr, 0xF4, 0x27)
        bus.write_byte_data(addr, 0xF5, 0xA0)
        _bme_calibration = calib
        print("[INFO] BME280 calibration loaded")
    except Exception as exc:
        _bme_calibration = None
        print("[WARN] BME calibration failed:", exc)

def _compensate_bme280(raw_t, raw_p, raw_h):
    global _bme_t_fine
    calib = _bme_calibration
    if not calib:
        return None, None, None
    try:
        var1 = ((raw_t / 16384.0) - (calib["dig_T1"] / 1024.0)) * calib["dig_T2"]
        var2 = (((raw_t / 131072.0) - (calib["dig_T1"] / 8192.0)) ** 2) * calib["dig_T3"]
        _bme_t_fine = var1 + var2
        temp_c = _bme_t_fine / 5120.0
        var1 = _bme_t_fine / 2.0 - 64000.0
        var2 = var1 * var1 * calib["dig_P6"] / 32768.0
        var2 = var2 + var1 * calib["dig_P5"] * 2.0
        var2 = var2 / 4.0 + calib["dig_P4"] * 65536.0
        var1 = (calib["dig_P3"] * var1 * var1 / 524288.0 + calib["dig_P2"] * var1) / 524288.0
        var1 = (1.0 + var1 / 32768.0) * calib["dig_P1"]
        if abs(var1) < 1e-6:
            pressure_hpa = None
        else:
            pressure = 1048576.0 - raw_p
            pressure = ((pressure - var2 / 4096.0) * 6250.0) / var1
            var1 = calib["dig_P9"] * pressure * pressure / 2147483648.0
            var2 = pressure * calib["dig_P8"] / 32768.0
            pressure = pressure + (var1 + var2 + calib["dig_P7"]) / 16.0
            pressure_hpa = pressure / 100.0
        var_h = _bme_t_fine - 76800.0
        var_h = (raw_h - (calib["dig_H4"] * 64.0 + calib["dig_H5"] / 16384.0 * var_h))
        var_h *= calib["dig_H2"] / 65536.0
        var_h *= 1.0 - calib["dig_H1"] * var_h / 524288.0
        humidity = max(0.0, min(100.0, var_h))
        return float(temp_c), (None if pressure_hpa is None else float(pressure_hpa)), float(humidity)
    except Exception as exc:
        print("[WARN] BME compensation error:", exc)
        return None, None, None

# -------- PCA9685 init (on CH 3 in your setup) ----------
with SMBus(I2C_BUS) as _bus:
    set_mux_channel(_bus, 3)
    freq = 200
    prescale = int(25000000.0 / (4096 * freq) - 1)
    _bus.write_byte_data(PCA_ADDR, 0x00, 0x00)
    old_mode = _bus.read_byte_data(PCA_ADDR, 0x00)
    _bus.write_byte_data(PCA_ADDR, 0x00, (old_mode & 0x7F) | 0x10)
    _bus.write_byte_data(PCA_ADDR, 0xFE, prescale)
    _bus.write_byte_data(PCA_ADDR, 0x00, old_mode)
    time.sleep(0.005)
    _bus.write_byte_data(PCA_ADDR, 0x00, old_mode | 0x80)

# ==========================================================
# Thermal loop (MLX90640) with smoothing
# ==========================================================
def thermal_loop():
    global thermal_frame, sensor_data, smooth_state
    try:
        import adafruit_extended_bus
        i2c_bus_num = 3
        print("[INFO] Init MLX90640 on I2C bus %d ..." % i2c_bus_num)
        i2c = adafruit_extended_bus.ExtendedI2C(i2c_bus_num)
        mlx = MLX90640(i2c)
        mlx.refresh_rate = 2
        frame = [0] * 768
        print("[INFO] MLX90640 ready on bus %d" % i2c_bus_num)
    except Exception as e:
        print("[ERROR] MLX init:", e)
        return

    while True:
        try:
            mlx.getFrame(frame)
            data = np.array(frame).reshape((24, 32))
            thermal_frame = data

            tmin_now = float(np.min(data))
            tmax_now = float(np.max(data))

            smooth_state["thermal_min"] = smooth_val(smooth_state["thermal_min"], tmin_now, 0.2)
            smooth_state["thermal_max"] = smooth_val(smooth_state["thermal_max"], tmax_now, 0.2)

            sensor_data["thermal"]["tmin"] = smooth_state["thermal_min"]
            sensor_data["thermal"]["tmax"] = smooth_state["thermal_max"]

            time.sleep(0.4)
        except Exception as e:
            print("[WARN] MLX read:", e)
            time.sleep(0.5)

def thermal_stream():
    while True:
        try:
            img = thermal_frame.copy()
            norm = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX)
            color = cv2.applyColorMap(norm.astype(np.uint8), cv2.COLORMAP_INFERNO)
            color = cv2.GaussianBlur(color, (3, 3), 0)
            color = cv2.resize(color, (640, 480), interpolation=cv2.INTER_CUBIC)

            t_min = sensor_data["thermal"]["tmin"]
            t_max = sensor_data["thermal"]["tmax"]

            if t_min is not None and t_max is not None:
                txt = "Min: %.2fC  Max: %.2fC" % (t_min, t_max)
            else:
                txt = "Min/Max: n/a"

            cv2.putText(
                color,
                txt,
                (10, 25),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2
            )

            cv2.line(color, (320, 0), (320, 480), (255, 255, 255), 1)
            cv2.line(color, (0, 240), (640, 240), (255, 255, 255), 1)

            ret, jpeg = cv2.imencode(".jpg", color)
            if not ret:
                continue

            yield (
                b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" +
                jpeg.tobytes() +
                b"\r\n"
            )

            time.sleep(0.25)
        except Exception as e:
            print("[STREAM ERROR]", e)
            time.sleep(0.5)

# ==========================================================
# Sensor loop (BME raw, Compass, IMU) with smoothing
# ==========================================================
def read_bme280_raw(bus, addr=BME_ADDR):
    d = bus.read_i2c_block_data(addr, 0xF7, 8)
    raw_t = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)
    raw_p = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4)
    raw_h = (d[6] << 8) | d[7]
    return raw_t, raw_p, raw_h

def read_qmc5883l(bus, addr=0x0D):
    d = bus.read_i2c_block_data(addr, 0x00, 6)
    x = twos_complement((d[1] << 8) | d[0], 16)
    y = twos_complement((d[3] << 8) | d[2], 16)
    z = twos_complement((d[5] << 8) | d[4], 16)
    return x, y, z

def read_bmi160(bus, addr=0x69):
    acc = bus.read_i2c_block_data(addr, 0x12, 6)
    ax = twos_complement((acc[1] << 8) | acc[0], 16)
    ay = twos_complement((acc[3] << 8) | acc[2], 16)
    az = twos_complement((acc[5] << 8) | acc[4], 16)
    gyro = bus.read_i2c_block_data(addr, 0x0C, 6)
    gx = twos_complement((gyro[1] << 8) | gyro[0], 16)
    gy = twos_complement((gyro[3] << 8) | gyro[2], 16)
    gz = twos_complement((gyro[5] << 8) | gyro[4], 16)
    return ax, ay, az, gx, gy, gz

def sensor_loop():
    global sensor_data, smooth_state
    with SMBus(I2C_BUS) as bus:
        # one time init for sensors
        try:
            set_mux_channel(bus, CH_IMU)
            bus.write_byte_data(0x69, 0x7E, 0x11)
            time.sleep(0.01)
            bus.write_byte_data(0x69, 0x7E, 0x15)
            time.sleep(0.01)
        except Exception as e:
            print("[WARN] BMI init:", e)

        try:
            set_mux_channel(bus, CH_COMPASS)
            bus.write_byte_data(0x0D, 0x09, 0x1D)
            time.sleep(0.01)
        except Exception as e:
            print("[WARN] QMC init:", e)

        try:
            set_mux_channel(bus, CH_BME)
            _ = bus.read_byte_data(BME_ADDR, 0xD0)
            _ensure_bme_calibration(bus, BME_ADDR)
        except Exception as e:
            print("[WARN] BME touch:", e)

        while True:
            try:
                # BME block
                try:
                    set_mux_channel(bus, CH_BME)
                    _ensure_bme_calibration(bus, BME_ADDR)
                    rt, rp, rh = read_bme280_raw(bus, BME_ADDR)
                    temp_c, pressure_hpa, humidity = _compensate_bme280(rt, rp, rh)

                    smooth_state["temp_c"] = smooth_val(smooth_state["temp_c"], temp_c, 0.2)
                    smooth_state["pressure_hpa"] = smooth_val(smooth_state["pressure_hpa"], pressure_hpa, 0.2)
                    smooth_state["humidity_pct"] = smooth_val(smooth_state["humidity_pct"], humidity, 0.2)

                    sensor_data["bme"].update(
                        {
                            "raw_t": int(rt),
                            "raw_p": int(rp),
                            "raw_h": int(rh),
                            "temp_c": None if smooth_state["temp_c"] is None else float(smooth_state["temp_c"]),
                            "pressure_hpa": None if smooth_state["pressure_hpa"] is None else float(smooth_state["pressure_hpa"]),
                            "humidity_pct": None if smooth_state["humidity_pct"] is None else float(smooth_state["humidity_pct"]),
                        }
                    )
                except Exception as e:
                    print("[WARN] BME read failed:", e)

                # Compass block
                try:
                    set_mux_channel(bus, CH_COMPASS)
                    mx_raw, my_raw, mz_raw = read_qmc5883l(bus, 0x0D)

                    mx = mx_raw - calibration_offsets["mag_x"]
                    my = my_raw - calibration_offsets["mag_y"]
                    mz = mz_raw - calibration_offsets["mag_z"]

                    heading_now = (math.degrees(math.atan2(my, mx)) + 360.0) % 360.0
                    heading_now = (heading_now - calibration_offsets["heading"] + 360.0) % 360.0

                    smooth_state["heading_deg"] = smooth_val(
                        smooth_state["heading_deg"],
                        heading_now,
                        0.2
                    )

                    sensor_data["mag"].update({
                        "x": int(round(mx)),
                        "y": int(round(my)),
                        "z": int(round(mz)),
                        "heading_deg": None if smooth_state["heading_deg"] is None
                                        else float(smooth_state["heading_deg"])
                    })
                except Exception:
                    pass

                # IMU block
                try:
                    set_mux_channel(bus, CH_IMU)
                    ax_raw, ay_raw, az_raw, gx_raw, gy_raw, gz_raw = read_bmi160(bus, 0x69)

                    ax = ax_raw - calibration_offsets["accel_x"]
                    ay = ay_raw - calibration_offsets["accel_y"]
                    az = az_raw - calibration_offsets["accel_z"]

                    gx = gx_raw - calibration_offsets["gyro_x"]
                    gy = gy_raw - calibration_offsets["gyro_y"]
                    gz = gz_raw - calibration_offsets["gyro_z"]

                    smooth_state["accel_x"] = smooth_val(smooth_state["accel_x"], ax, 0.3)
                    smooth_state["accel_y"] = smooth_val(smooth_state["accel_y"], ay, 0.3)
                    smooth_state["accel_z"] = smooth_val(smooth_state["accel_z"], az, 0.3)

                    smooth_state["gyro_x"] = smooth_val(smooth_state["gyro_x"], gx, 0.3)
                    smooth_state["gyro_y"] = smooth_val(smooth_state["gyro_y"], gy, 0.3)
                    smooth_state["gyro_z"] = smooth_val(smooth_state["gyro_z"], gz, 0.3)

                    sensor_data["accel"].update({
                        "x": int(round(smooth_state["accel_x"])) if smooth_state["accel_x"] is not None else int(round(ax)),
                        "y": int(round(smooth_state["accel_y"])) if smooth_state["accel_y"] is not None else int(round(ay)),
                        "z": int(round(smooth_state["accel_z"])) if smooth_state["accel_z"] is not None else int(round(az)),
                    })
                    sensor_data["gyro"].update({
                        "x": int(round(smooth_state["gyro_x"])) if smooth_state["gyro_x"] is not None else int(round(gx)),
                        "y": int(round(smooth_state["gyro_y"])) if smooth_state["gyro_y"] is not None else int(round(gy)),
                        "z": int(round(smooth_state["gyro_z"])) if smooth_state["gyro_z"] is not None else int(round(gz)),
                    })
                except Exception:
                    pass

            except Exception as e:
                print("[WARN] sensor loop:", e)

            time.sleep(0.2)

# ==========================================================
# Camera streams (CSI via rpicam-vid, USB via OpenCV)
# ==========================================================
def csi_stream():
    cmd = [
        "rpicam-vid",
        "-t","0",
        "--inline",
        "--codec","mjpeg",
        "--width","640",
        "--height","480",
        "--framerate","15",
        "--nopreview",
        "-o","-"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=10**8)
    buffer = b""
    try:
        while True:
            chunk = proc.stdout.read(1024)
            if not chunk:
                break
            buffer += chunk
            s = buffer.find(b"\xff\xd8")
            e = buffer.find(b"\xff\xd9")
            if s != -1 and e != -1 and e > s:
                jpg = buffer[s:e+2]
                buffer = buffer[e+2:]
                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" +
                    jpg +
                    b"\r\n"
                )
    finally:
        proc.kill()

def usb_stream(device="/dev/video0"):
    cap = cv2.VideoCapture(device)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 15)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    while True:
        ret, frame = cap.read()
        if not ret:
            continue
        ret, jpeg = cv2.imencode(".jpg", frame)
        if not ret:
            continue
        yield (
            b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" +
            jpeg.tobytes() +
            b"\r\n"
        )
    cap.release()
    
    
    
    
# ==========================================================
# Calibration logic (Accel, Gyro, Magnetometer)
# ==========================================================
calibration_running = False
calibration_result = None
calibration_offsets = {
    "accel_x": 0, "accel_y": 0, "accel_z": 0,
    "gyro_x": 0, "gyro_y": 0, "gyro_z": 0,
    "mag_x": 0, "mag_y": 0, "mag_z": 0, "heading": 0
}

def run_calibration(duration_sec=30):
    global calibration_running, calibration_result, calibration_offsets, smooth_state, sensor_data
    calibration_running = True
    calibration_result = None
    print("[INFO] Starting 30s calibration... vehicle must be still, facing North")

    samples = {k: [] for k in calibration_offsets.keys()}

    start = time.time()
    while time.time() - start < duration_sec:
        d = sensor_data.copy()
        acc = d.get("accel", {})
        gyr = d.get("gyro", {})
        mag = d.get("mag", {})

        for axis in ("x","y","z"):
            if acc.get(axis) is not None: samples["accel_" + axis].append(acc[axis])
            if gyr.get(axis) is not None: samples["gyro_" + axis].append(gyr[axis])
            if mag.get(axis) is not None: samples["mag_" + axis].append(mag[axis])
        if mag.get("heading_deg") is not None:
            samples["heading"].append(mag["heading_deg"])

        time.sleep(0.2)

    def stats(lst):
        if len(lst) == 0: return None
        avg = sum(lst)/len(lst)
        return {
            "min": min(lst),
            "max": max(lst),
            "avg": avg,
            "std": (max(lst)-avg + avg-min(lst))/2
        }

    calibration_result = {k: stats(v) for k,v in samples.items()}

    # compute offsets (zero level for each axis)
    for k,v in calibration_result.items():
        if v and "avg" in v:
            calibration_offsets[k] = v["avg"]

    for axis in ("x", "y", "z"):
        smooth_state[f"accel_{axis}"] = 0
        smooth_state[f"gyro_{axis}"] = 0
        sensor_data["accel"][axis] = 0
        sensor_data["gyro"][axis] = 0
        sensor_data["mag"][axis] = 0

    smooth_state["heading_deg"] = 0
    sensor_data["mag"]["heading_deg"] = 0

    calibration_running = False
    print("[INFO] Calibration done. Offsets updated.")


# ==========================================================
# Flask app and Web UI
# ==========================================================
app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

HTML = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>ARES Control and Sensors</title>
  <style>
    body { background:#111; color:#fff; font-family: system-ui, sans-serif; margin:0; }
    h1 { text-align:center; margin:16px 0; }
    .grid { display:grid; grid-template-columns: repeat(auto-fit,minmax(320px,1fr)); gap:16px; padding:16px; }
    .card { background:#1b1b1b; border-radius:12px; padding:12px; box-shadow:0 0 12px #000 inset; }
    .streams img { width:100%; max-height:260px; object-fit:cover; border-radius:8px; }
    .val { font: 13px/1.4 monospace; white-space:pre-wrap; }
    .compass-wrap { position:relative; width:280px; height:280px; margin:0 auto; }
    .compass { width:100%; height:100%; }
    .needle { transform-origin: 50% 50%; transition: transform 0.2s linear; }
    canvas { background:#000; border-radius:8px; }
    .sliders { display:grid; grid-template-columns: repeat(auto-fit,minmax(140px,1fr)); gap:8px; }
    input[type=range] { width:100%; }
    h3 { margin-top:0; font-size:14px; font-weight:600; color:#fff; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/three/build/three.min.js"></script>
</head>
<body>
  <h1>ARES Control + Cameras + Sensors</h1>

  <div class="grid">
    <div class="card streams">
      <h3>CSI camera</h3>
      <img src="/csi_feed">
    </div>
    <div class="card streams">
      <h3>USB camera</h3>
      <img src="/usb_feed">
    </div>
    <div class="card streams">
      <h3>Thermal camera (MLX90640)</h3>
      <img src="/thermal_feed">
    </div>

    <div class="card">
      <h3>Sensor values</h3>
      <div class="val" id="vals">loading...</div>
    </div>

    <div class="card">
      <h3>Compass (mag)</h3>
      <div class="compass-wrap">
        <svg class="compass" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="95" fill="#111" stroke="#444" stroke-width="2"/>
          <g fill="#888" font-size="14" text-anchor="middle" dominant-baseline="middle">
            <text x="100" y="18">N</text>
            <text x="100" y="182">S</text>
            <text x="182" y="100">E</text>
            <text x="18"  y="100">W</text>
          </g>
          <circle cx="100" cy="100" r="2" fill="#888"/>
          <g id="needle" class="needle">
            <polygon points="100,20 95,105 105,105" fill="#ff4d4d"/>
            <polygon points="100,180 95,95 105,95" fill="#999"/>
          </g>
        </svg>
      </div>
      <div class="val" id="comp_text">heading: --.- deg</div>
    </div>

    <div class="card">
      <h3>IMU 3D cube (accel/gyro)</h3>
      <canvas id="cube" width="320" height="260"></canvas>
    </div>

    <div class="card">
      <h3>Servo and LED</h3>
      <div class="sliders">
        <div>Servo Front<br><input type="range" min="0" max="180" value="90" oninput="sendUpdate(1,'servo',this.value)"></div>
        <div>Servo Rear<br><input type="range" min="0" max="180" value="90" oninput="sendUpdate(2,'servo',this.value)"></div>
        <div>Servo 8<br><input type="range" min="0" max="180" value="90" oninput="sendUpdate(8,'servo',this.value)"></div>
        <div>Servo 10<br><input type="range" min="0" max="180" value="90" oninput="sendUpdate(10,'servo',this.value)"></div>
        <div>Servo 11<br><input type="range" min="0" max="180" value="90" oninput="sendUpdate(11,'servo',this.value)"></div>
        <div>Laser Front (LED 12)<br><input type="range" min="0" max="100" value="0"  oninput="sendUpdate(12,'led',this.value)"></div>
        <div>Laser Pan Module (LED 13)<br><input type="range" min="0" max="100" value="0"  oninput="sendUpdate(13,'led',this.value)"></div>
        <div>Light Pan Module (LED 14)<br><input type="range" min="0" max="100" value="0"  oninput="sendUpdate(14,'led',this.value)"></div>
        <div>Front Light (LED 15)<br><input type="range" min="0" max="100" value="0"  oninput="sendUpdate(15,'led',this.value)"></div>
      </div>
    </div>
  </div>

<script>
async function getData(){
  try{
    const r = await fetch('/sensor_data');
    return await r.json();
  }catch(e){ return null; }
}

function sendUpdate(channel, type, value){
  fetch('/update', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({channel:channel, type:type, value:value})
  });
}

// compass rotation
function setHeading(deg){
  const n = document.getElementById('needle');
  n.style.transform = 'rotate(' + deg + 'deg)';
  document.getElementById('comp_text').textContent =
    'heading: ' + deg.toFixed(1) + ' deg';
}

// init 3D scene
let renderer, scene, camera, cube;
(function init3D(){
  const canvas = document.getElementById('cube');
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
  });
  renderer.setSize(canvas.width, canvas.height, false);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    60,
    canvas.width/canvas.height,
    0.1,
    100
  );
  camera.position.z = 3;
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1,1,1);
  scene.add(light);
  cube = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshNormalMaterial()
  );
  scene.add(cube);
  function animate(){
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
})();

// map IMU to cube
function applyIMU(accel, gyro){
  if(!accel || !gyro) return;
  const ax = accel.x||0;
  const ay = accel.y||0;
  const az = accel.z||16384;
  const gz = (gyro.z||0)/15000.0;

  const roll  = Math.atan2(ay, az);
  const pitch = Math.atan2(-ax, Math.sqrt(ay*ay + az*az));

  cube.rotation.x = pitch;
  cube.rotation.z = -roll;
  cube.rotation.y += gz * 0.2;
}

function updateValues(d){
  if(!d) return;
  const tmin = d.thermal.tmin;
  const tmax = d.thermal.tmax;
  const acc = d.accel;
  const gyr = d.gyro;
  const mag = d.mag;
  const bme = d.bme;

  const lines = [];
  lines.push(
    'THERMAL: min=' +
    (tmin===null ? 'n/a' : tmin.toFixed(2)) +
    ' C, max=' +
    (tmax===null ? 'n/a' : tmax.toFixed(2)) +
    ' C'
  );
  lines.push('ACCEL:  x=' + acc.x + ', y=' + acc.y + ', z=' + acc.z);
  lines.push('GYRO:   x=' + gyr.x + ', y=' + gyr.y + ', z=' + gyr.z);
  lines.push(
    'MAG:    x=' + mag.x +
    ', y=' + mag.y +
    ', z=' + mag.z +
    '  | heading=' +
    (mag.heading_deg===null ? 'n/a' : mag.heading_deg.toFixed(1)) +
    ' deg'
  );
  lines.push(
    'BME:    T=' + bme.temp_c +
    ' C, p=' + bme.pressure_hpa +
    ' hPa, hum=' + bme.humidity_pct +
    ' %'
  );
  lines.push(
    'BME raw: temp=' + bme.raw_t +
    ', press=' + bme.raw_p +
    ', hum=' + bme.raw_h
  );

  document.getElementById('vals').textContent =
    lines.join('\\n');

  if(mag.heading_deg != null){
    setHeading(mag.heading_deg);
  }

  applyIMU(acc, gyr);
}

async function loop(){
  const d = await getData();
  updateValues(d);
  setTimeout(loop, 900);
}
loop();
</script>
</body>
</html>
"""

@app.route("/")
def index():
    return render_template_string(HTML)

@app.route("/csi_feed")
def csi_feed():
    return Response(
        csi_stream(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )

@app.route("/usb_feed")
def usb_feed():
    return Response(
        usb_stream(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )

@app.route("/thermal_feed")
def thermal_feed():
    return Response(
        thermal_stream(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )

@app.route("/sensor_data")
def sensor_json():
    return jsonify(sensor_data)

@app.route("/update", methods=["POST", "OPTIONS"])
def update():
    if request.method == "OPTIONS":
        return ("", 204)
    d = request.get_json()
    ch = int(d["channel"])
    val = int(d["value"])
    typ = d["type"]
    with SMBus(I2C_BUS) as bus:
        set_mux_channel(bus, 3)
        if typ == "servo":
            set_pwm(bus, ch, servo_deg_to_pwm(val))
        elif typ == "led":
            set_pwm(bus, ch, led_pct_to_pwm(val))
    return jsonify(success=True)
    
@app.route("/calibrate", methods=["POST"])
def start_calibration():
    global calibration_running
    if calibration_running:
        return jsonify({"status":"already_running"})
    threading.Thread(target=run_calibration, args=(30,), daemon=True).start()
    return jsonify({"status":"started"})

@app.route("/calibration_result")
def get_calibration_result():
    return jsonify({
        "running": calibration_running,
        "result": calibration_result,
        "offsets": calibration_offsets
    })


# ==========================================================
# main entry
# ==========================================================
if __name__ == "__main__":
    threading.Thread(target=thermal_loop, daemon=True).start()
    threading.Thread(target=sensor_loop, daemon=True).start()
    app.run(host="0.0.0.0", port=5000)
