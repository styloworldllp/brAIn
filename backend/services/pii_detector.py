"""
PII column detector — smarter matching, no false positives on generic IDs.

Rules:
- Generic "id", "code", "no" columns are NEVER PII
- Columns ending in _id/_code/_no are only PII if a very specific PII prefix is present
- Uses word-segment matching instead of substring matching
"""
import re
from typing import Dict, List

# ── Never flag these as PII ───────────────────────────────────────────────────
NEVER_PII = {
    "id","no","num","number","code","key","ref","reference","serial","seq",
    "sequence","idx","index","rank","order","status","type","mode","flag",
    "active","enabled","deleted","created_at","updated_at","modified_at",
    "created_by","updated_by","start_date","end_date","due_date","quantity",
    "qty","amount","total","subtotal","tax","discount","price","rate","value",
    "count","balance","percentage","percent","ratio","score","rating","weight",
    "description","notes","remarks","comment","comments","company_id","product_id",
    "item_id","order_id","invoice_id","transaction_id","record_id","doc_id",
    "employee_id","emp_id","staff_id","dept_id","department_id","branch_id",
    "store_id","shop_id","warehouse_id","location_id","category_id","group_id",
    "team_id","project_id","task_id","ticket_id","case_id","lead_id","account_id",
    "vendor_id","supplier_id","customer_id","client_id","partner_id","parent_id",
    "child_id","type_id","status_id","stage_id","role_id","session_id",
    "request_id","batch_id","job_id","run_id","version_id","log_id","audit_id",
    "event_id","action_id","row_id","line_id","page_id","module_id","report_id",
    "template_id","form_id","field_id","tag_id","currency_id","country_id",
    "region_id","state_id","city_id","area_id","zone_id","channel_id","source_id",
    "campaign_id","ad_id","modified_by","deleted_at",
}

# Specific PII prefixes that make *_id valid PII
PII_ID_PREFIXES = {"ssn","aadhar","aadhaar","passport","national","credit_card","bank_account","insurance","patient"}

PII_PATTERNS: Dict[str, List[str]] = {
    "Name":          ["first_name","last_name","full_name","middle_name","surname",
                      "given_name","fname","lname","employee_name","customer_name",
                      "contact_name","person_name","owner_name","manager_name"],
    "Email":         ["email","email_address","e_mail","emailid","email_id",
                      "work_email","personal_email","official_email"],
    "Phone":         ["phone","mobile","telephone","cell_number","contact_no",
                      "phone_number","mobile_number","contact_number","fax_number",
                      "whatsapp_number","landline"],
    "National ID":   ["ssn","social_security","national_id","national_number","nin",
                      "nric","aadhar","aadhaar","passport_number","tax_id","tin",
                      "vat_number","driving_license","dl_number"],
    "Address":       ["address","street","addr","address1","address2","address_line",
                      "street_address","home_address","mailing_address",
                      "billing_address","shipping_address","residential_address"],
    "Postal Code":   ["zip","zipcode","zip_code","postcode","postal_code","pincode","pin_code"],
    "Date of Birth": ["dob","date_of_birth","birth_date","birthday","birthdate","birth_day"],
    "Financial":     ["credit_card","card_number","cvv","bank_account","account_number",
                      "iban","routing_number","swift_code","sort_code","pan_number","debit_card"],
    "IP Address":    ["ip_address","ipv4","ipv6","remote_addr","client_ip","user_ip"],
    "Geolocation":   ["latitude","longitude","coordinates","gps_location","geo_location"],
    "Salary":        ["salary","wage","compensation","ctc","annual_income","monthly_salary",
                      "gross_salary","net_salary","remuneration","payroll_amount"],
    "Username":      ["username","user_name","login_id","login_name","screen_name","handle"],
    "Password":      ["password","passwd","pwd","auth_token","api_key","api_secret",
                      "access_token","refresh_token","private_key","secret_key"],
    "Gender":        ["gender","sex","gender_code"],
    "Race/Ethnicity":["race","ethnicity","caste"],
    "Religion":      ["religion","faith"],
    "Medical":       ["diagnosis","disease","medical_condition","health_condition",
                      "medication","prescription","blood_type","blood_group",
                      "medical_record","health_record","allergy","disability"],
}

HIGH_SEVERITY   = {"National ID","Financial","Password","Date of Birth"}
MEDIUM_SEVERITY = {"Email","Phone","Address","IP Address","Salary","Username",
                   "Race/Ethnicity","Religion","Medical","Name"}


def _norm(s: str) -> str:
    return re.sub(r"[-\s]+", "_", s.lower().strip())


def detect_pii_columns(columns: List[str]) -> Dict[str, dict]:
    results = {}
    for col in columns:
        cn = _norm(col)

        # Hard-skip known safe columns
        if cn in NEVER_PII:
            results[col] = {"is_pii": False, "category": None, "severity": None, "confidence": "high"}
            continue

        # Skip *_id/*_code/*_no etc. unless a specific PII prefix is present
        if re.search(r"_(id|code|no|num|key|ref|seq|idx)$", cn):
            if not any(cn.startswith(p + "_") for p in PII_ID_PREFIXES):
                results[col] = {"is_pii": False, "category": None, "severity": None, "confidence": "high"}
                continue

        matched = None
        confidence = "medium"
        parts = cn.split("_")

        for category, patterns in PII_PATTERNS.items():
            for pattern in patterns:
                pn = _norm(pattern)
                # Exact match
                if cn == pn:
                    matched = category; confidence = "high"; break
                # Word-segment match (pattern words appear as contiguous block in col)
                ppx = pn.split("_")
                n, m = len(parts), len(ppx)
                for i in range(n - m + 1):
                    if parts[i:i+m] == ppx:
                        matched = category; break
                if matched: break
            if matched and confidence == "high": break

        if matched:
            sev = "high" if matched in HIGH_SEVERITY else "medium" if matched in MEDIUM_SEVERITY else "low"
            results[col] = {"is_pii": True, "category": matched, "severity": sev, "confidence": confidence}
        else:
            results[col] = {"is_pii": False, "category": None, "severity": None, "confidence": "high"}

    return results


def get_pii_summary(pii_results: Dict[str, dict]) -> dict:
    high   = sum(1 for v in pii_results.values() if v["severity"] == "high")
    medium = sum(1 for v in pii_results.values() if v["severity"] == "medium")
    low    = sum(1 for v in pii_results.values() if v["severity"] == "low")
    return {"high": high, "medium": medium, "low": low,
            "total_pii": high+medium+low, "total_cols": len(pii_results)}
