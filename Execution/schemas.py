from pydantic import BaseModel, Field
from typing import Literal, List, Optional



class NewsFact(BaseModel):
    subject_entity: str = Field(
        description=(
            "Short label for the SPECIFIC thing this fact is about — not the company "
            "itself, but the topic, e.g. 'Order Book', 'Net Debt to EBITDA', "
            "'NCD Series IV Rating', 'Optical Cable Demand Outlook'. "
            "Copy naming from the document verbatim where possible — do not "
            "paraphrase or abbreviate differently than the document does, so the "
            "same topic gets the same label across different filings."
        )
    )
    reporting_period: Optional[str] = Field(
        None,
        description=(
            "The specific time period or as-of date this fact refers to, if any — "
            "e.g. 'Q3 FY26', 'FY26', 'as on December 31, 2025'. Copy exactly as the "
            "document states it. Use null if the fact has no specific period."
        )
    )
    event_category: Literal[
        "Order_Won",
        "Order_Lost",
        "Dividend_Declaration",
        "Fund_Raising",
        "Capital_Expenditure",
        "Management_Change",
        "Regulatory_Action_Penalty",
        "Legal_Dispute_Litigation",
        "Asset_Acquisition_Divestment",
        "Earnings_Release_Approval",
        "Stock_Split_Bonus",
        "Business_Operational_Update",
        "Credit_Rating_Update",
        "Other_Material_Disclosure",
    ] = Field(
        description="Structural category this fact maps to — used for filtering/alerts, not analysis."
    )
    alert_message: str = Field(
        description=(
            "ONE or TWO sentences reporting this fact the way a sharp human analyst "
            "would tell you what just happened — natural spoken language, not a dry "
            "filing summary. Name the company, say what happened, and anchor timing "
            "using the filing's actual broadcast date/time if it was provided to you "
            "(e.g. 'just announced', 'filed after market close on the 19th'). Never "
            "invent a time that wasn't given to you."
        )
    )
    page_number: int = Field(description="Exact page number where this fact was found.")
    verbatim_source_quote: str = Field(
        description="Exact raw sentence(s) from the document this fact was drawn from."
    )


class FilingNewsExtraction(BaseModel):
    company_symbol: str = Field(description="NSE ticker symbol.")
    filing_date: str = Field(description="Date of disclosure.")
    has_material_development: bool = Field(
        description=(
            "True only if at least one fact is genuinely market-moving "
            "(order win/loss, M&A, litigation, rating change, capex, dividend, "
            "leadership change, etc.) — not just routine disclosure noise."
        )
    )
    facts: List[NewsFact] = Field(
        default=[],
        description="Array of all newsworthy atomic facts found in the document."
    )


SCHEMA_REGISTRY = {
    "express": (FilingNewsExtraction, "short corporate filing", "cheap"),
}