# 보행 네트워크 데이터 템플릿

현재 프로젝트에는 대전 중앙시장 내부의 실제 보행 네트워크 데이터가 없다. 따라서 `site/data/network_nodes.geojson`와 `site/data/network_edges.geojson`는 임의 경로가 아니라, 향후 QGIS 또는 현장조사를 통해 채워야 할 템플릿으로 둔다.

## network_nodes.geojson

노드는 출입구, 교차점, 주요 통로 기준점, 편의시설 앞 지점, 점포군 대표 연결점 등을 나타내는 Point 데이터이다.

필수 속성은 다음과 같다.

| 필드 | 의미 |
| --- | --- |
| `node_id` | 노드 고유 ID |
| `node_type` | 노드 유형 |
| `name` | 사람이 이해하기 쉬운 지점명 |
| `description` | 위치 설명, 주변 기준점, 조사 메모 |

`node_type` 예시는 다음과 같다.

| 값 | 의미 |
| --- | --- |
| `entrance` | 시장 출입구 또는 주요 진입 지점 |
| `junction` | 골목 교차점 |
| `facility` | 화장실, 안내소, 쉼터 등 편의시설 |
| `store_anchor` | 여러 점포가 연결되는 대표 지점 |
| `transit` | 역, 정류장 등 대중교통 연결 지점 |
| `parking` | 주차장 또는 차량 접근 지점 |

## network_edges.geojson

엣지는 실제 걸을 수 있는 통로를 나타내는 LineString 데이터이다. 두 노드를 연결하며, 경로 계산의 기본 단위가 된다.

필수 속성은 다음과 같다.

| 필드 | 의미 |
| --- | --- |
| `edge_id` | 엣지 고유 ID |
| `from_node` | 시작 노드 ID |
| `to_node` | 도착 노드 ID |
| `length_m` | 통로 길이(m). 가능하면 GIS 길이 계산값 사용 |
| `width_level` | 통로 폭 수준. 예: 1 좁음, 2 보통, 3 넓음 |
| `congestion_level` | 혼잡 수준. 예: 1 낮음, 2 보통, 3 높음 |
| `turn_complexity` | 방향 전환 또는 길찾기 복잡도 |
| `cognitive_cost` | 초행자가 이해하기 어려운 정도 |
| `is_main_aisle` | 큰 통로 또는 기준 통로 여부 |
| `is_inner_alley` | 안쪽 골목 또는 소외 가능 골목 여부 |

## 경로 유형별 비용 설계

빠른 장보기는 거리 최소화를 우선한다.

```text
cost = length_m
```

초행자 친화형은 거리뿐 아니라 방향 전환과 인지 비용을 함께 고려한다.

```text
cost = length_m + turn_complexity_weight + cognitive_cost_weight
```

상생형은 혼잡과 인지 비용을 고려하면서 안쪽 골목 노출 효과를 보너스로 반영할 수 있다.

```text
cost = length_m + congestion_weight + cognitive_cost_weight - inner_alley_exposure_bonus
```

## 연구상 주의

실제 네트워크 데이터가 없는 상태에서는 이 프로젝트의 경로 결과를 실제 보행 최단 경로라고 표현하지 않는다. 현재 웹 앱과 시나리오 분석은 점포 좌표 간 직선거리를 활용한 예비 동선 분석이다. 실제 시장 내부 골목 단위 경로 최적화를 위해서는 QGIS 기반 네트워크 구축 또는 현장조사 데이터가 필요하다.
