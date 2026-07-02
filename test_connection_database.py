# save as test_connection.py and run once
from dotenv import load_dotenv
from supabase import create_client
import os

load_dotenv()

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"]
)

# Test 1: can we read stocks?
stocks = supabase.table("nse_stocks").select("symbol, company_name").limit(5).execute()
print("✓ Stocks:", stocks.data)

# Test 2: can we insert a dummy news item?
test = supabase.table("news_items").insert({
    "symbol": "TCS",
    "alert_message": "Test alert from Python",
    "event_category": "TEST",
    "has_material_development": False,
}).execute()
print("✓ Insert worked:", test.data)