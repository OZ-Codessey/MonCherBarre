# "창구" 역할만 하는 파일. HTTP 요청/응답 형식만 다루고, 실제 로직은 전부
# services/data_service.py에 맡긴다 — 그래서 이 파일은 짧고 읽기 쉽다.
from fastapi import APIRouter

from app.schemas.data import DataCreate, DataOut, DataSummary, DataUpdate
from app.services import data_service

# prefix="/api/data" 덕분에 아래 각 경로는 실제로 /api/data, /api/data/{id} 등이 된다
router = APIRouter(prefix="/api/data", tags=["data"])


@router.get("", response_model=list[DataOut])  # GET /api/data
def list_data():
    return data_service.list_data()


@router.post("", response_model=DataOut, status_code=201)  # POST /api/data
def create_data(item: DataCreate):
    return data_service.create_data(item)


@router.put("/{item_id}", response_model=DataOut)  # PUT /api/data/{id}
def update_data(item_id: str, item: DataUpdate):
    return data_service.update_data(item_id, item)


@router.delete("/{item_id}", status_code=204)  # DELETE /api/data/{id}
def delete_data(item_id: str):
    data_service.delete_data(item_id)


@router.get("/summary", response_model=DataSummary)  # GET /api/data/summary
def get_summary():
    return data_service.get_summary()


@router.get("/statistics")  # GET /api/data/statistics — 월별평균·최다요일·연속일수
def get_statistics():
    return data_service.get_statistics()
