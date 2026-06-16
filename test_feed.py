import urllib.request
import xml.etree.ElementTree as ET
import sys
import ssl

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def test_parse():
    try:
        print("Fetching BigQuery XML Feed...")
        headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
        req = urllib.request.Request(FEED_URL, headers=headers)
        
        # Bypass SSL verification if needed (common on macOS Python setups)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, timeout=10, context=context) as response:
            xml_data = response.read()
        print("Feed fetched. Length:", len(xml_data), "bytes")
        
        root = ET.fromstring(xml_data)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        entries = root.findall('atom:entry', ns)
        print("Found", len(entries), "entries.")
        
        if not entries:
            print("ERROR: No entries found.")
            sys.exit(1)
            
        for i, entry in enumerate(entries[:3]): # test first 3
            title_elem = entry.find('atom:title', ns)
            title = title_elem.text if title_elem is not None else 'N/A'
            
            updated_elem = entry.find('atom:updated', ns)
            updated = updated_elem.text if updated_elem is not None else 'N/A'
            
            link_elem = entry.find("atom:link[@rel='alternate']", ns)
            link = link_elem.attrib.get('href') if link_elem is not None else 'N/A'
            
            content_elem = entry.find('atom:content', ns)
            content = content_elem.text if content_elem is not None else ''
            
            print(f"\n--- Entry {i+1} ---")
            print(f"Title: {title}")
            print(f"Updated: {updated}")
            print(f"Link: {link}")
            print(f"Content snippet (first 100 chars): {content[:100].strip()}...")
            
        print("\nTest passed successfully!")
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)

if __name__ == "__main__":
    test_parse()
