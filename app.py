import time
import urllib.request
import xml.etree.ElementTree as ET
import ssl
import json
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Configuration
WORLDCUP_FEED_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json"
NEWS_FEED_URL = "https://www.espn.com/espn/rss/soccer/news"
CACHE_DURATION = 300  # Cache for 5 minutes

# Simple in-memory caches
worldcup_cache = {
    "data": None,
    "last_fetched": 0
}

news_cache = {
    "data": None,
    "last_fetched": 0
}

def fetch_worldcup_data(force_refresh=False):
    """
    Fetches the World Cup 2026 JSON feed from openfootball on GitHub.
    """
    now = time.time()
    if not force_refresh and worldcup_cache["data"] is not None and (now - worldcup_cache["last_fetched"] < CACHE_DURATION):
        return worldcup_cache["data"]

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        req = urllib.request.Request(WORLDCUP_FEED_URL, headers=headers)
        
        # Bypass SSL verification
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, timeout=15, context=context) as response:
            json_data = json.loads(response.read().decode('utf-8'))

        # Save to cache
        worldcup_cache["data"] = json_data
        worldcup_cache["last_fetched"] = now
        return json_data

    except Exception as e:
        if worldcup_cache["data"] is not None:
            print(f"Warning: Failed to fetch World Cup data, serving from cache. Error: {e}")
            return worldcup_cache["data"]
        raise RuntimeError(f"Failed to fetch World Cup 2026 data: {str(e)}")

def fetch_and_parse_news(force_refresh=False):
    """
    Fetches and parses the ESPN Soccer RSS feed.
    """
    now = time.time()
    if not force_refresh and news_cache["data"] is not None and (now - news_cache["last_fetched"] < CACHE_DURATION):
        return news_cache["data"]

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        req = urllib.request.Request(NEWS_FEED_URL, headers=headers)
        
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, timeout=15, context=context) as response:
            xml_data = response.read()

        root = ET.fromstring(xml_data)
        
        items = []
        channel = root.find('channel')
        if channel is not None:
            for item in channel.findall('item'):
                title_elem = item.find('title')
                title = title_elem.text if title_elem is not None else ''

                link_elem = item.find('link')
                link = link_elem.text if link_elem is not None else ''

                desc_elem = item.find('description')
                desc = desc_elem.text if desc_elem is not None else ''

                pub_elem = item.find('pubDate')
                pub_date = pub_elem.text if pub_elem is not None else ''

                items.append({
                    'title': title,
                    'link': link,
                    'description': desc,
                    'pubDate': pub_date
                })

        news_cache["data"] = items
        news_cache["last_fetched"] = now
        return items

    except Exception as e:
        if news_cache["data"] is not None:
            print(f"Warning: Failed to fetch soccer news, serving from cache. Error: {e}")
            return news_cache["data"]
        raise RuntimeError(f"Failed to fetch soccer news feed: {str(e)}")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/worldcup")
def get_worldcup_data():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        data = fetch_worldcup_data(force_refresh=force_refresh)
        return jsonify({
            "success": True,
            "data": data,
            "cached_at": worldcup_cache["last_fetched"],
            "from_cache": not force_refresh and (time.time() - worldcup_cache["last_fetched"] > 0.5)
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route("/api/news")
def get_soccer_news():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        news = fetch_and_parse_news(force_refresh=force_refresh)
        return jsonify({
            "success": True,
            "news": news,
            "cached_at": news_cache["last_fetched"],
            "from_cache": not force_refresh and (time.time() - news_cache["last_fetched"] > 0.5)
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route("/api/log_error", methods=["POST"])
def log_error():
    try:
        data = request.json or {}
        message = data.get("message", "Unknown error")
        source = data.get("source", "unknown")
        lineno = data.get("lineno", "?")
        colno = data.get("colno", "?")
        stack = data.get("stack", "")
        
        print("\n" + "="*50)
        print(f"CLIENT-SIDE JS ERROR:")
        print(f"Message: {message}")
        print(f"Source: {source} at line {lineno}:{colno}")
        if stack:
            print("Stack Trace:")
            print(stack)
        print("="*50 + "\n")
        return jsonify({"success": True})
    except Exception as e:
        print(f"Error logging client error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.after_request
def add_header(response):
    """
    Add headers to prevent browser caching of assets.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

if __name__ == "__main__":
    # Run server on port 5001 (macOS AirPlay uses port 5000)
    app.run(host="127.0.0.1", port=5001, debug=True)
