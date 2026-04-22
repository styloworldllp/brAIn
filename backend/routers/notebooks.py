import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, DateTime, Text, JSON
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from db import get_db, Base, engine, User
from routers.auth import require_brain_access

router = APIRouter()


class Notebook(Base):
    __tablename__ = "notebooks"
    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title       = Column(String, nullable=False)
    description = Column(Text, default="")
    dataset_id  = Column(String)
    cells       = Column(JSON, default=list)   # list of {id, type, content, output}
    template    = Column(String, default="blank")
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Create table if not exists
Base.metadata.create_all(bind=engine)


def _s(n: Notebook) -> dict:
    return {
        "id":          n.id,
        "title":       n.title,
        "description": n.description,
        "dataset_id":  n.dataset_id,
        "dataset_ids": [n.dataset_id] if n.dataset_id else [],
        "cells":       n.cells or [],
        "template":    n.template,
        "created_at":  n.created_at.isoformat(),
        "updated_at":  n.updated_at.isoformat(),
    }


TEMPLATES = {
    "eda": {
        "title": "Exploratory Data Analysis",
        "description": "Automatically explore your dataset — shape, types, missing values, distributions and correlations.",
        "cells": [
            {"id": "c1", "type": "markdown", "content": "# Exploratory Data Analysis\nAuto-generated overview of your dataset.", "output": None},
            {"id": "c2", "type": "code", "content": "# Dataset shape and types\nprint(f'Shape: {df.shape}')\nprint('\\nColumn types:')\nprint(df.dtypes)\nprint('\\nMissing values:')\nprint(df.isnull().sum()[df.isnull().sum() > 0])", "output": None},
            {"id": "c3", "type": "code", "content": "# Summary statistics\ndf.describe(include='all')", "output": None},
            {"id": "c4", "type": "code", "content": "# Distribution of numeric columns\nimport plotly.express as px\nnumeric_cols = df.select_dtypes(include='number').columns.tolist()\nif numeric_cols:\n    fig = px.histogram(df, x=numeric_cols[0], title=f'Distribution of {numeric_cols[0]}')\n    fig.show()", "output": None},
            {"id": "c5", "type": "code", "content": "# Correlation heatmap\nimport plotly.express as px\nnumeric_df = df.select_dtypes(include='number')\nif len(numeric_df.columns) > 1:\n    fig = px.imshow(numeric_df.corr(), title='Correlation Matrix', color_continuous_scale='RdBu_r', zmin=-1, zmax=1)\n    fig.show()", "output": None},
        ]
    },
    "sales": {
        "title": "Sales Performance Report",
        "description": "Analyse revenue trends, top customers, and product performance from your sales data.",
        "cells": [
            {"id": "c1", "type": "markdown", "content": "# Sales Performance Report\nAnalyse revenue, customers, and trends.", "output": None},
            {"id": "c2", "type": "code", "content": "# Preview data\nprint(df.shape)\ndf.head(3)", "output": None},
            {"id": "c3", "type": "code", "content": "# Total revenue and order count\nimport plotly.express as px\nprint('Total rows:', len(df))\nnumeric = df.select_dtypes(include='number')\nprint('\\nNumeric column sums:')\nprint(numeric.sum().sort_values(ascending=False).head(10))", "output": None},
            {"id": "c4", "type": "code", "content": "# Top 10 by largest numeric column\nimport plotly.express as px\ncol = df.select_dtypes(include='number').sum().idxmax()\nif col:\n    top = df.nlargest(10, col)\n    fig = px.bar(top, x=top.columns[0], y=col, title=f'Top 10 by {col}')\n    fig.show()", "output": None},
            {"id": "c5", "type": "code", "content": "# Trend over time (if date column exists)\nimport plotly.express as px\ndate_cols = df.select_dtypes(include='datetime').columns.tolist()\nif date_cols:\n    num_col = df.select_dtypes(include='number').columns[0]\n    fig = px.line(df.sort_values(date_cols[0]), x=date_cols[0], y=num_col, title=f'{num_col} over time')\n    fig.show()\nelse:\n    print('No datetime column found. Convert a date column first.')", "output": None},
        ]
    },
    "customer": {
        "title": "Customer Segmentation",
        "description": "Segment your customers by value, frequency, and behaviour using RFM-style analysis.",
        "cells": [
            {"id": "c1", "type": "markdown", "content": "# Customer Segmentation\nGroup customers by value and behaviour.", "output": None},
            {"id": "c2", "type": "code", "content": "# Data overview\nprint(df.shape)\ndf.head(3)", "output": None},
            {"id": "c3", "type": "code", "content": "# Identify customer and value columns\nprint('Columns:', df.columns.tolist())\nprint('\\nData types:')\nprint(df.dtypes)", "output": None},
            {"id": "c4", "type": "code", "content": "# Group by first text column and sum numeric\nimport plotly.express as px\ntext_col  = df.select_dtypes(include='object').columns[0] if len(df.select_dtypes(include='object').columns) else None\nnum_col   = df.select_dtypes(include='number').columns[0]  if len(df.select_dtypes(include='number').columns) else None\nif text_col and num_col:\n    grouped = df.groupby(text_col)[num_col].sum().sort_values(ascending=False).head(15)\n    fig = px.bar(grouped, title=f'Top 15 {text_col} by {num_col}')\n    fig.show()", "output": None},
            {"id": "c5", "type": "code", "content": "# Distribution pie chart\nimport plotly.express as px\ntext_col = df.select_dtypes(include='object').columns[0] if len(df.select_dtypes(include='object').columns) else None\nnum_col  = df.select_dtypes(include='number').columns[0]  if len(df.select_dtypes(include='number').columns) else None\nif text_col and num_col:\n    grouped = df.groupby(text_col)[num_col].sum().sort_values(ascending=False).head(8)\n    fig = px.pie(values=grouped.values, names=grouped.index, title=f'{num_col} share by {text_col}')\n    fig.show()", "output": None},
        ]
    },
}


@router.get("/templates")
def list_templates(_: User = Depends(require_brain_access)):
    return [{"id": k, "title": v["title"], "description": v["description"]} for k, v in TEMPLATES.items()]


@router.get("/")
def list_notebooks(db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    return [_s(n) for n in db.query(Notebook).order_by(Notebook.updated_at.desc()).all()]


class CreateNotebookRequest(BaseModel):
    title:      str
    template:   Optional[str] = "blank"
    dataset_id: Optional[str] = None
    dataset_ids: Optional[List[str]] = None


@router.post("/")
def create_notebook(req: CreateNotebookRequest, db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    tmpl  = TEMPLATES.get(req.template, {})
    cells = tmpl.get("cells", [{"id": str(uuid.uuid4()), "type": "code", "content": "# Start your analysis\ndf.head()", "output": None}])
    # Give each cell a fresh ID
    import copy
    cells = copy.deepcopy(cells)
    for c in cells:
        c["id"] = str(uuid.uuid4())

    n = Notebook(
        id          = str(uuid.uuid4()),
        title       = req.title or tmpl.get("title", "Untitled notebook"),
        description = tmpl.get("description", ""),
        dataset_id  = (req.dataset_ids or [req.dataset_id])[0] if (req.dataset_ids or [req.dataset_id])[0] else None,
        cells       = cells,
        template    = req.template or "blank",
    )
    db.add(n); db.commit()
    return _s(n)


@router.get("/{notebook_id}")
def get_notebook(notebook_id: str, db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    n = db.query(Notebook).filter(Notebook.id == notebook_id).first()
    if not n: raise HTTPException(404, "Not found")
    return _s(n)


class UpdateNotebookRequest(BaseModel):
    title:      Optional[str] = None
    cells:      Optional[List[dict]] = None
    dataset_id: Optional[str] = None
    dataset_ids: Optional[List[str]] = None


@router.patch("/{notebook_id}")
def update_notebook(notebook_id: str, req: UpdateNotebookRequest, db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    n = db.query(Notebook).filter(Notebook.id == notebook_id).first()
    if not n: raise HTTPException(404, "Not found")
    if req.title      is not None: n.title      = req.title
    if req.cells      is not None: n.cells      = req.cells
    if req.dataset_ids is not None:
        n.dataset_id = req.dataset_ids[0] if req.dataset_ids else None
    elif req.dataset_id is not None:
        n.dataset_id = req.dataset_id
    n.updated_at = datetime.utcnow()
    db.commit()
    return _s(n)


@router.delete("/{notebook_id}")
def delete_notebook(notebook_id: str, db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    n = db.query(Notebook).filter(Notebook.id == notebook_id).first()
    if not n: raise HTTPException(404, "Not found")
    db.delete(n); db.commit()
    return {"ok": True}
