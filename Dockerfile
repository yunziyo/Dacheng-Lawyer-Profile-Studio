FROM node:22-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DACHENG_HOST=0.0.0.0 \
    DACHENG_PORT=8788 \
    DACHENG_DATA=/var/lib/dacheng-workbench

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng librsvg2-bin fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN python3 -m pip install --break-system-packages --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt
COPY . /workspace
WORKDIR /workspace

EXPOSE 8788
VOLUME ["/var/lib/dacheng-workbench"]
CMD ["python3", "server.py"]
