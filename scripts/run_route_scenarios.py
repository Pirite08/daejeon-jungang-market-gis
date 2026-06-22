import csv
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "site" / "data"
ANALYSIS_DIR = ROOT / "analysis"


SCENARIOS = {
    "S1": ["과일·채소", "반찬·식료품", "떡·한과"],
    "S2": ["정육", "과일·채소", "반찬·식료품"],
    "S3": ["수산·건어물", "반찬·식료품", "분식·먹거리"],
    "S4": ["떡·한과", "분식·먹거리", "카페·음료"],
    "S5": ["생활용품", "의류·잡화", "카페·음료"],
    "S6": ["과일·채소", "정육", "수산·건어물", "반찬·식료품"],
}

ROUTE_TYPES = ["빠른 장보기", "초행자 친화형", "상생형"]
WALKING_M_PER_MIN = 67


def haversine_m(lat1, lon1, lat2, lon2):
    radius = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def coords(feature):
    lon, lat = feature["geometry"]["coordinates"]
    return lat, lon


def distance_between(a, b):
    lat1, lon1 = a
    lat2, lon2 = b
    return haversine_m(lat1, lon1, lat2, lon2)


def candidate_pool(features, category):
    pool = [feature for feature in features if feature["properties"].get("shopping_category") == category]
    return sorted(
        pool,
        key=lambda feature: (
            not feature["properties"].get("directMarketMatch"),
            feature["properties"].get("distanceM", 9999),
            feature["properties"].get("coordinate_duplicate_count", 1),
            feature["properties"].get("name", ""),
        ),
    )[:30]


def score_candidate(route_type, current_point, feature):
    props = feature["properties"]
    point = coords(feature)
    distance = distance_between(current_point, point)
    if route_type == "빠른 장보기":
        return distance
    if route_type == "초행자 친화형":
        score = distance + props.get("distanceM", 0) * 0.25
        if props.get("directMarketMatch"):
            score -= 45
        if props.get("distance_zone") == "중심부":
            score -= 25
        score += min(props.get("coordinate_duplicate_count", 1), 20) * 1.5
        return score
    score = distance
    if props.get("distance_zone") == "외곽부":
        score -= 55
    elif props.get("distance_zone") == "중간부":
        score -= 25
    if props.get("directMarketMatch"):
        score -= 10
    return score


def build_route(features, categories, route_type, start_point):
    remaining_categories = list(categories)
    route = []
    current = start_point
    while remaining_categories:
        options = []
        for category in remaining_categories:
            for feature in candidate_pool(features, category):
                options.append((score_candidate(route_type, current, feature), category, feature))
        if not options:
            break
        _score, chosen_category, chosen_feature = min(options, key=lambda item: item[0])
        route.append(chosen_feature)
        remaining_categories.remove(chosen_category)
        current = coords(chosen_feature)
    return route


def route_distance(route, start_point):
    total = 0
    current = start_point
    for feature in route:
        point = coords(feature)
        total += distance_between(current, point)
        current = point
    return round(total)


def metrics(route, start_point, fast_distance=None):
    total_distance = route_distance(route, start_point)
    props = [feature["properties"] for feature in route]
    fast_increase = 0
    if fast_distance:
        fast_increase = round((total_distance - fast_distance) / fast_distance * 100, 2)
    return {
        "방문점포수": len(route),
        "총거리_m": total_distance,
        "예상이동시간_분": round(total_distance / WALKING_M_PER_MIN, 1),
        "중심부점포수": sum(1 for prop in props if prop.get("distance_zone") == "중심부"),
        "외곽부점포수": sum(1 for prop in props if prop.get("distance_zone") == "외곽부"),
        "직접매칭점포수": sum(1 for prop in props if prop.get("directMarketMatch")),
        "빠른장보기대비거리증가율": fast_increase,
    }


def route_store_summary(route):
    return " > ".join(
        f"{feature['properties'].get('shopping_category')}:{feature['properties'].get('name')}"
        for feature in route
    )


def main():
    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    data_path = DATA_DIR / "stores_enriched.geojson"
    if not data_path.exists():
        raise SystemExit("stores_enriched.geojson이 없습니다. enrich_shopping_categories.py를 먼저 실행하세요.")
    features = json.loads(data_path.read_text(encoding="utf-8"))["features"]
    metadata = json.loads((DATA_DIR / "metadata.json").read_text(encoding="utf-8"))
    center = metadata["filter"]["center"]
    start_point = (center["lat"], center["lon"])

    rows = []
    json_rows = []
    for scenario_id, categories in SCENARIOS.items():
        fast_route = build_route(features, categories, "빠른 장보기", start_point)
        fast_distance = route_distance(fast_route, start_point)
        route_results = {}
        for route_type in ROUTE_TYPES:
            route = build_route(features, categories, route_type, start_point)
            route_metrics = metrics(route, start_point, fast_distance=fast_distance)
            row = {
                "시나리오": scenario_id,
                "구매목록": ", ".join(categories),
                "경로유형": route_type,
                **route_metrics,
                "방문순서": route_store_summary(route),
            }
            rows.append(row)
            route_results[route_type] = {
                "metrics": route_metrics,
                "stores": [
                    {
                        "id": feature["properties"].get("id"),
                        "name": feature["properties"].get("name"),
                        "shopping_category": feature["properties"].get("shopping_category"),
                        "smallCategory": feature["properties"].get("smallCategory"),
                        "distanceM": feature["properties"].get("distanceM"),
                        "distance_zone": feature["properties"].get("distance_zone"),
                        "directMarketMatch": feature["properties"].get("directMarketMatch"),
                        "coordinates": feature["geometry"]["coordinates"],
                    }
                    for feature in route
                ],
            }
        json_rows.append({"scenario": scenario_id, "categories": categories, "routes": route_results})

    fieldnames = [
        "시나리오",
        "구매목록",
        "경로유형",
        "방문점포수",
        "총거리_m",
        "예상이동시간_분",
        "중심부점포수",
        "외곽부점포수",
        "직접매칭점포수",
        "빠른장보기대비거리증가율",
        "방문순서",
    ]
    with (ANALYSIS_DIR / "route_scenario_results.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    (DATA_DIR / "route-scenario-results.json").write_text(
        json.dumps(json_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# 장보기 시나리오별 예비 경로 비교",
        "",
        "이 결과는 실제 보행 네트워크가 아니라 점포 좌표 간 직선거리를 이용한 예비 분석이다. 시장 내부 골목 단위의 실제 길찾기 결과로 해석해서는 안 된다.",
        "",
    ]
    for scenario_id, categories in SCENARIOS.items():
        lines.append(f"## {scenario_id}. {', '.join(categories)}")
        scenario_rows = [row for row in rows if row["시나리오"] == scenario_id]
        fast = next(row for row in scenario_rows if row["경로유형"] == "빠른 장보기")
        newcomer = next(row for row in scenario_rows if row["경로유형"] == "초행자 친화형")
        coexist = next(row for row in scenario_rows if row["경로유형"] == "상생형")
        lines.extend(
            [
                f"- 빠른 장보기: 총 {fast['총거리_m']}m, 중심부 {fast['중심부점포수']}개, 외곽부 {fast['외곽부점포수']}개",
                f"- 초행자 친화형: 총 {newcomer['총거리_m']}m, 직접 매칭 {newcomer['직접매칭점포수']}개, 거리 증가율 {newcomer['빠른장보기대비거리증가율']}%",
                f"- 상생형: 총 {coexist['총거리_m']}m, 외곽부 {coexist['외곽부점포수']}개, 거리 증가율 {coexist['빠른장보기대비거리증가율']}%",
                "",
            ]
        )
    lines.extend(
        [
            "## 해석",
            "",
            "빠른 장보기 경로는 점포 좌표 간 이동거리를 줄이는 데 유리하다. 초행자 친화형 경로는 중심부와 시장명 직접 매칭 점포를 더 우선하여 시장 구조를 이해하기 쉬운 후보를 제시한다. 상생형 경로는 이동거리 증가를 감수하더라도 외곽부 또는 덜 노출될 수 있는 점포를 일부 포함하도록 설계한 연구 시나리오이다.",
            "",
            "현재 결과는 주소 기반 점포 좌표를 사용하기 때문에 실제 시장 내부 통로, 방향 전환, 혼잡, 출입구 접근성을 반영하지 못한다. 향후 QGIS 또는 현장조사를 통해 보행 네트워크를 구축하면 Dijkstra 또는 A* 기반으로 실제 보행 비용을 계산하고, Greedy와 2-opt 방식으로 다중 목적지 방문 순서를 개선할 수 있다.",
        ]
    )
    (ANALYSIS_DIR / "route_scenario_report.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"scenarios": len(json_rows), "rows": len(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
