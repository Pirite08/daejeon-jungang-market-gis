import csv
import io
import json
import math
import statistics
import zipfile
from pathlib import Path


ZIP_GLOB = "*20260331.zip"
ENTRY_MARKER = "대전"
OUTPUT_DIR = Path("site/data")
RADIUS_M = 300

COL = {
    "id": "상가업소번호",
    "name": "상호명",
    "branch": "지점명",
    "large": "상권업종대분류명",
    "mid": "상권업종중분류명",
    "small": "상권업종소분류명",
    "sigungu": "시군구명",
    "admin": "행정동명",
    "legal": "법정동명",
    "lot_address": "지번주소",
    "road_name": "도로명",
    "building": "건물명",
    "road_address": "도로명주소",
    "lon": "경도",
    "lat": "위도",
}

MARKET_TERMS = [
    "중앙시장",
    "원동중앙시장",
    "신중앙시장",
    "대전중앙도매시장",
    "대전도매시장",
    "도매시장",
]


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


def compact(row, lat, lon, center=None):
    direct_text = " ".join(
        row.get(COL[key], "")
        for key in ["name", "building", "road_address", "lot_address", "road_name"]
    )
    direct_market = (
        row.get(COL["sigungu"]) == "동구"
        and row.get(COL["admin"]) == "중앙동"
        and any(term in direct_text for term in MARKET_TERMS)
    )
    distance = haversine_m(center[0], center[1], lat, lon) if center else None
    return {
        "id": row.get(COL["id"], ""),
        "name": row.get(COL["name"], ""),
        "branch": row.get(COL["branch"], ""),
        "category": row.get(COL["large"], ""),
        "middleCategory": row.get(COL["mid"], ""),
        "smallCategory": row.get(COL["small"], ""),
        "sigungu": row.get(COL["sigungu"], ""),
        "adminDong": row.get(COL["admin"], ""),
        "legalDong": row.get(COL["legal"], ""),
        "roadAddress": row.get(COL["road_address"], ""),
        "lotAddress": row.get(COL["lot_address"], ""),
        "building": row.get(COL["building"], ""),
        "directMarketMatch": direct_market,
        "distanceM": round(distance) if distance is not None else None,
    }


def main():
    downloads = Path.home() / "Downloads"
    zip_path = max(downloads.glob(ZIP_GLOB), key=lambda path: path.stat().st_size)

    all_rows = []
    direct_points = []
    with zipfile.ZipFile(zip_path) as archive:
        entry_name = next(name for name in archive.namelist() if ENTRY_MARKER in name)
        with archive.open(entry_name) as csv_file:
            reader = csv.DictReader(
                io.TextIOWrapper(csv_file, encoding="utf-8-sig", newline="")
            )
            for row in reader:
                try:
                    lat = float(row[COL["lat"]])
                    lon = float(row[COL["lon"]])
                except (ValueError, KeyError):
                    continue
                props = compact(row, lat, lon)
                all_rows.append((row, lat, lon, props))
                if props["directMarketMatch"]:
                    direct_points.append((lat, lon))

    center = [
        statistics.mean(point[0] for point in direct_points),
        statistics.mean(point[1] for point in direct_points),
    ]

    selected = []
    for row, lat, lon, _props in all_rows:
        if row.get(COL["sigungu"]) != "동구" or row.get(COL["admin"]) != "중앙동":
            continue
        distance = haversine_m(center[0], center[1], lat, lon)
        if distance <= RADIUS_M:
            selected.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": compact(row, lat, lon, center),
                }
            )

    selected.sort(
        key=lambda feature: (
            not feature["properties"]["directMarketMatch"],
            feature["properties"]["distanceM"],
            feature["properties"]["name"],
        )
    )

    category_counts = {}
    direct_count = 0
    for feature in selected:
        props = feature["properties"]
        category_counts[props["category"]] = category_counts.get(props["category"], 0) + 1
        direct_count += int(props["directMarketMatch"])

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    geojson = {
        "type": "FeatureCollection",
        "features": selected,
    }
    (OUTPUT_DIR / "stores.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    metadata = {
        "title": "대전 중앙시장권역 점포 GIS",
        "sourceFile": zip_path.name,
        "sourceEntry": entry_name,
        "sourceDate": "2026-03-31",
        "filter": {
            "region": "대전광역시 동구 중앙동",
            "center": {"lat": center[0], "lon": center[1]},
            "radiusM": RADIUS_M,
            "directMarketTerms": MARKET_TERMS,
        },
        "counts": {
            "stores": len(selected),
            "directMarketMatches": direct_count,
            "surroundingStores": len(selected) - direct_count,
            "categories": dict(sorted(category_counts.items(), key=lambda item: -item[1])),
        },
    }
    (OUTPUT_DIR / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUTPUT_DIR / "market-data.js").write_text(
        "window.DAEJEON_MARKET_DATA = "
        + json.dumps(
            {"geojson": geojson, "metadata": metadata},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + ";\n",
        encoding="utf-8",
    )
    print(json.dumps(metadata["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
