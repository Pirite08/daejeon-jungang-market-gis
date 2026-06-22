# 대전 중앙시장권역 GIS 장보기 동선 분석

이 프로젝트는 대전 중앙시장권역의 점포 위치와 업종 데이터를 활용해 전통시장 내부 공간 구조, 장보기 품목군 분포, 구매목록 기반 후보 점포 추천, 예비 경로 비교를 수행하는 Leaflet 기반 정적 웹 GIS 앱이다.

## 실행 방법

간단한 로컬 서버를 실행한 뒤 브라우저에서 `site/index.html`을 연다.

```bash
python -m http.server 8000 -d site
```

브라우저 주소:

```text
http://localhost:8000
```

`file://`로 직접 열어도 `site/data/market-data.js`의 내장 데이터를 사용해 기본 탐색 기능이 동작하도록 구성했다. 다만 일부 JSON 파일 추가 로딩은 로컬 서버 환경이 더 안정적이다.

## 폴더 구조

```text
scripts/
  extract_market_data.py
  analyze_market_data.py
  enrich_shopping_categories.py
  run_route_scenarios.py

site/
  index.html
  app.js
  styles.css
  data/
    stores.geojson
    stores_enriched.geojson
    metadata.json
    market-data.js
    analysis-summary.json
    shopping-category-summary.json
    route-scenario-results.json
    network_nodes.geojson
    network_edges.geojson

analysis/
  data_quality_report.md
  category_summary.csv
  coordinate_duplicates.csv
  distance_zone_summary.csv
  shopping_category_summary.csv
  route_scenario_results.csv
  route_scenario_report.md
  network_data_template.md
  research_method.md
  data_limitations.md
  final_research_outline.md
```

## 주요 기능

- 중앙시장권역 점포 1,200개 지도 시각화
- 업종 대분류, 장보기 품목군, 거리 구간 필터
- 시장명 직접 매칭 점포와 주변 권역 점포 구분
- 중심부·중간부·외곽부 100m, 200m, 300m 반경 시각화
- 좌표 중복 보기 모드
- 장보기 목록 기반 후보 점포 추천
- 빠른 장보기, 초행자 친화형, 상생형 예비 경로 비교
- 시나리오별 경로 비교 결과 요약

## 연구상 주의

현재 경로는 실제 보행 네트워크가 아니라 점포 좌표 간 직선거리를 이용한 예비 분석이다. 실제 시장 내부 골목 단위 경로 최적화를 위해서는 QGIS 또는 현장조사를 통해 출입구, 교차점, 통로, 혼잡도, 방향 전환 난이도 등의 보행 네트워크 데이터를 추가해야 한다.
