FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV FLASK_APP=app.main:app
ENV PYTHONUNBUFFERED=1

EXPOSE 5002

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5002} --workers 2 app.main:app"]
