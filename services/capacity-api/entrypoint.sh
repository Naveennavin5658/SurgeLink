#!/bin/bash
set -e

echo "Waiting for MongoDB..."
until python -c "
from pymongo import MongoClient
import os
uri = os.environ.get('MONGODB_URI', 'mongodb://mongodb:27017/surgelink')
MongoClient(uri).admin.command('ping')
" 2>/dev/null; do
  sleep 2
done

echo "MongoDB is ready. Running seed if needed..."
python -c "from app.seed import seed_database; seed_database()"

echo "Starting Capacity API..."
exec python -m flask run --host=0.0.0.0 --port=5001
