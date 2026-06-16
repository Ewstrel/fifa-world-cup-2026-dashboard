import time
import urllib.request
import xml.etree.ElementTree as ET
import ssl
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Configuration
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_DURATION = 60  # Cache for 60 seconds to avoid spamming the endpoint

# Simple in-memory cache
feed_cache = {
    "data": None,
    "last_fetched": 0
}

def fetch_and_parse_feed(force_refresh=False):
    """
    Fetches the BigQuery Atom feed, parses it using ET,
    and returns a list of release entries.
    """
    now = time.time()
    # Return cache if still valid and not forced to refresh
    if not force_refresh and feed_cache["data"] is not None and (now - feed_cache["last_fetched"] < CACHE_DURATION):
        return feed_cache["data"]

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        req = urllib.request.Request(FEED_URL, headers=headers)
        
        # Bypass SSL verification (common on macOS Python setups)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, timeout=15, context=context) as response:
            xml_data = response.read()

        root = ET.fromstring(xml_data)
        
        # Atom Namespace mapping
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        entries = []
        for entry in root.findall('atom:entry', ns):
            title_elem = entry.find('atom:title', ns)
            title = title_elem.text if title_elem is not None else ''

            updated_elem = entry.find('atom:updated', ns)
            updated = updated_elem.text if updated_elem is not None else ''

            link_elem = entry.find("atom:link[@rel='alternate']", ns)
            link = link_elem.attrib.get('href') if link_elem is not None else ''

            content_elem = entry.find('atom:content', ns)
            content = content_elem.text if content_elem is not None else ''

            entries.append({
                'title': title,
                'updated': updated,
                'link': link,
                'content': content
            })

        # Save to cache
        feed_cache["data"] = entries
        feed_cache["last_fetched"] = now
        return entries

    except Exception as e:
        # If fetch fails but we have cached data, return that instead of crashing
        if feed_cache["data"] is not None:
            print(f"Warning: Failed to fetch feed, serving from stale cache. Error: {e}")
            return feed_cache["data"]
        raise RuntimeError(f"Failed to fetch or parse release notes feed: {str(e)}")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/releases")
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        releases = fetch_and_parse_feed(force_refresh=force_refresh)
        return jsonify({
            "success": True,
            "releases": releases,
            "cached_at": feed_cache["last_fetched"],
            "from_cache": not force_refresh and (time.time() - feed_cache["last_fetched"] > 0.5)
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == "__main__":
    # Run server on port 5000
    app.run(host="127.0.0.1", port=5000, debug=True)
