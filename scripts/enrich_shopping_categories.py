import csv
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "site" / "data"
ANALYSIS_DIR = ROOT / "analysis"


SHOPPING_CATEGORY_ORDER = [
    "과일·채소",
    "정육",
    "수산·건어물",
    "반찬·식료품",
    "떡·한과",
    "분식·먹거리",
    "카페·음료",
    "의류·잡화",
    "생활용품",
    "보건·약국",
    "기타 소매",
    "기타 음식",
    "비장보기 업종",
]


RULES = [
    ("과일·채소", ["과일", "청과", "채소", "야채", "농산", "과채"]),
    ("정육", ["정육", "축산", "고기", "육류", "한우", "돼지", "닭고기"]),
    ("수산·건어물", ["수산", "생선", "건어물", "어물", "해산", "회", "젓갈"]),
    ("반찬·식료품", ["반찬", "식료품", "식품", "슈퍼", "마트", "쌀", "곡물", "두부", "김치", "할랄", "식자재"]),
    ("떡·한과", ["떡", "한과", "떡집", "방앗간"]),
    ("분식·먹거리", ["분식", "김밥", "만두", "국수", "칼국수", "튀김", "순대", "호떡", "빵", "제과", "베이커리", "치킨", "피자", "탕", "찌개", "백반", "한정식"]),
    ("카페·음료", ["카페", "커피", "다방", "음료", "차", "비알코올"]),
    ("의류·잡화", ["의류", "의복", "신발", "한복", "가방", "잡화", "액세서리", "귀금속", "시계", "침구", "커튼", "섬유", "원단", "수선"]),
    ("생활용품", ["생활용품", "주방", "가정용품", "철물", "공구", "가전", "통신", "핸드폰", "문구", "화원", "담배", "중고", "가구"]),
    ("보건·약국", ["약국", "의약", "의료", "보청기", "한의원", "의원", "화장품", "건강"]),
]


def zone_for(distance_m):
    if distance_m is None:
        return "거리 정보 없음"
    if distance_m <= 100:
        return "중심부"
    if distance_m <= 200:
        return "중간부"
    return "외곽부"


def classify(props):
    text = " ".join(
        str(props.get(field) or "")
        for field in ["name", "category", "middleCategory", "smallCategory", "building", "roadAddress"]
    )
    for category, keywords in RULES:
        if any(keyword in text for keyword in keywords):
            return category
    if props.get("category") == "소매":
        return "기타 소매"
    if props.get("category") == "음식":
        return "기타 음식"
    return "비장보기 업종"


def write_csv(path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    geojson = json.loads((DATA_DIR / "stores.geojson").read_text(encoding="utf-8"))
    metadata = json.loads((DATA_DIR / "metadata.json").read_text(encoding="utf-8"))
    features = geojson["features"]

    coord_counts = Counter(tuple(feature["geometry"]["coordinates"]) for feature in features)
    shopping_counts = Counter()
    zone_counts = Counter()
    category_zone_counts = {category: Counter() for category in SHOPPING_CATEGORY_ORDER}

    for feature in features:
        props = feature["properties"]
        shopping_category = classify(props)
        distance_zone = zone_for(props.get("distanceM"))
        duplicate_count = coord_counts[tuple(feature["geometry"]["coordinates"])]

        props["shopping_category"] = shopping_category
        props["distance_zone"] = distance_zone
        props["is_core_market_store"] = bool(props.get("directMarketMatch")) or distance_zone == "중심부"
        props["is_outer_area"] = distance_zone == "외곽부"
        props["coordinate_duplicate_count"] = duplicate_count

        shopping_counts[shopping_category] += 1
        zone_counts[distance_zone] += 1
        category_zone_counts[shopping_category][distance_zone] += 1

    (DATA_DIR / "stores_enriched.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    summary_rows = []
    for category in SHOPPING_CATEGORY_ORDER:
        count = shopping_counts.get(category, 0)
        summary_rows.append(
            {
                "장보기품목군": category,
                "점포수": count,
                "비율": round(count / len(features) * 100, 2) if features else 0,
                "중심부": category_zone_counts[category].get("중심부", 0),
                "중간부": category_zone_counts[category].get("중간부", 0),
                "외곽부": category_zone_counts[category].get("외곽부", 0),
            }
        )

    write_csv(
        ANALYSIS_DIR / "shopping_category_summary.csv",
        summary_rows,
        ["장보기품목군", "점포수", "비율", "중심부", "중간부", "외곽부"],
    )

    summary = {
        "shoppingCategoryOrder": SHOPPING_CATEGORY_ORDER,
        "shoppingCategoryCounts": dict(shopping_counts.most_common()),
        "distanceZoneCounts": dict(zone_counts),
        "shoppingCategoryZoneCounts": {
            category: dict(counter) for category, counter in category_zone_counts.items()
        },
        "shoppingRelatedStores": sum(
            count
            for category, count in shopping_counts.items()
            if category not in ["비장보기 업종"]
        ),
        "coordinateDuplicate": {
            "uniqueCoordinates": len(coord_counts),
            "maxStoresAtOneCoordinate": max(coord_counts.values()) if coord_counts else 0,
        },
    }
    (DATA_DIR / "shopping-category-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    fallback_payload = {"geojson": geojson, "metadata": metadata, "shoppingSummary": summary}
    (DATA_DIR / "market-data.js").write_text(
        "window.DAEJEON_MARKET_DATA = "
        + json.dumps(fallback_payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(json.dumps(summary["shoppingCategoryCounts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
