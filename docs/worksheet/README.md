# Product & launch worksheet (Google Sheet)

`build_worksheet.py` generates the "Visual Assist – Product & Launch Worksheet" spreadsheet (tabs: Overview, Architecture, End-to-end flow, Services & costs, Roles & access, AI & workflows, Market, ROI calculator, Pricing, Plan & checklist, Risks, Decisions, Questions for you).

```
pip install openpyxl
python docs/worksheet/build_worksheet.py Visual-Assist-Worksheet.xlsx
```

Upload the .xlsx to Google Drive and open it with Google Sheets. The live copy is in the project owner's Drive. Edit the rows in the script, not only in the sheet, so the repo stays the source of truth.
