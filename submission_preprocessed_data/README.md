# 대전 중앙시장 GIS 전처리 데이터 제출본

이 폴더는 대전 중앙시장 Leaflet GIS 탐구 프로젝트에서 사용한 전처리 데이터와 검증 자료를 제출용으로 정리한 것이다.

## 1. data

- `stores_raw.geojson`: 중앙시장 점포 위치 원자료 성격의 GeoJSON.
- `stores_preprocessed_enriched.geojson`: 품목군, 추천 분석, 좌표 정리, 권역 정보 등을 반영한 전처리 점포 데이터.
- `pedestrian_network_nodes.geojson`: 사용자가 지도에서 보정한 보행 네트워크 노드 데이터.
- `pedestrian_network_edges.geojson`: 실제 골목과 통로 연결 관계를 반영한 보행 네트워크 엣지 데이터.
- `metadata.json`: 데이터 기준점, 좌표계, 프로젝트 메타데이터.
- `shopping_category_summary.json`: 품목군별 점포 수 요약.
- `analysis_summary.json`: 웹 GIS에서 사용하는 분석 요약 데이터.

## 2. analysis

- `category_summary.csv`: 품목군별 점포 분포 요약.
- `coordinate_duplicates.csv`: 동일 좌표 또는 중복 좌표 점포 점검 결과.
- `distance_zone_summary.csv`: 중심점 기준 거리권역 분포 요약.
- `store_network_connection_quality.csv`: 점포와 보행 네트워크의 연결 거리 검증 결과.

## 3. docs

- `data_quality_report.md`: 점포 데이터 품질과 전처리 결과 설명.
- `data_limitations.md`: 데이터 한계와 해석 시 주의점.
- `pedestrian_network_method.md`: 보행 네트워크 구축 방법.
- `network_validation_report.md`: 보행 네트워크 검증 결과.

## 4. qgis

- `jungang_market_project.qgz`: QGIS 작업 파일. GeoJSON 데이터와 함께 참고용으로 제출한다.

## 제출 시 설명

이 제출본은 단순 원본 지도 자료가 아니라, 점포 좌표 정리, 품목군 분류, 보행 네트워크 노드·엣지 구축, 점포-네트워크 연결성 검증까지 수행한 전처리 데이터이다. 따라서 보고서의 장보기 동선 최적화 분석은 `stores_preprocessed_enriched.geojson`, `pedestrian_network_nodes.geojson`, `pedestrian_network_edges.geojson`을 핵심 입력 자료로 사용한다.
