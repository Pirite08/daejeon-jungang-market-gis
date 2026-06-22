import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "prompt_usage_process_summary.docx"

sections = [
    ("title", "대전 중앙시장 Leaflet GIS 프로젝트 프롬프트 및 사용 과정 정리"),
    ("p", "이 문서는 대전 중앙시장권역 Leaflet 웹 GIS 탐구 프로젝트를 진행하면서 사용자가 Codex에게 요청한 주요 프롬프트와, 그에 따라 수행된 분석·개발·검증 과정을 연구 기록용으로 정리한 것이다."),
    ("h1", "1. 프로젝트의 출발점"),
    ("p", "초기 탐구 주제는 대전 중앙시장을 대상으로 한 전통시장 내부 공간 구조 분석 및 장보기 동선 최적화였다. 단순 지도 표시나 최단거리 계산이 아니라, 방문자가 실제로 겪는 길 찾기 문제, 목적 점포 탐색 어려움, 특정 골목 집중, 소외 골목 발생 문제를 GIS와 데이터 기반으로 해석하는 것이 핵심이었다."),
    ("p", "핵심 아이디어는 사용자가 사고 싶은 품목군을 입력하면 중앙시장 내부에서 어떤 점포들을 어떤 순서로 방문하는 것이 효율적인지 추천하는 ‘구매목록 기반 전통시장 장보기 동선 추천’이었다."),
    ("h1", "2. 사용자가 요청한 주요 프롬프트 흐름"),
    ("h2", "2.1 프로젝트 이해 및 파일 분석 요청"),
    ("bullet", "현재 GIS 폴더 안에 있는 중앙시장 관련 공간 데이터와 지도 자료를 읽고 어떤 파일들인지 분석해 달라고 요청했다."),
    ("bullet", "프로젝트가 단순 지도 표시가 아니라 전통시장 내부 공간 구조 분석, 초행자 길찾기, 소외 골목 활성화까지 포함해야 한다는 연구 방향을 제시했다."),
    ("h2", "2.2 웹 GIS 오류 수정 요청"),
    ("bullet", "초기 Leaflet 앱에서 경로가 제대로 보이지 않고 분석 구역 범위가 보이지 않는 문제를 해결해 달라고 요청했다."),
    ("bullet", "경로가 인도와 골목 구조를 반영하지 않고 점포 좌표 사이를 부자연스럽게 연결하는 문제를 지적했다."),
    ("bullet", "노드들이 실제 길 위가 아닌 이상한 위치에 찍혀 있어, 계속 화면을 검증하면서 수정해 달라고 요청했다."),
    ("h2", "2.3 보행 네트워크 구축 방식 논의"),
    ("bullet", "지도 API를 연결하는 것이 나을지, 웹상에서 사용자가 직접 점을 찍으면 Codex가 노드를 연결해 보행 네트워크를 형성하는 방식이 나을지 질문했다."),
    ("bullet", "최종적으로 사용자가 직접 지도 위에 점을 찍고, Codex가 그 점들을 참고해 실제 길에 맞게 연결하는 방식으로 진행하기로 했다."),
    ("bullet", "사용자가 업로드한 network_nodes_edited.geojson 파일을 바탕으로 중앙시장 내부 보행 네트워크 노드 36개와 엣지 61개를 구성했다."),
    ("h2", "2.4 동선 최적화 알고리즘 개선 요청"),
    ("bullet", "기존 경로가 너무 비효율적으로 보인다고 판단하여, 최종 동선 경로 최적화 알고리즘을 수정해 달라고 요청했다."),
    ("bullet", "단순히 Dijkstra로 연결하는 것만으로는 충분하지 않고, 점포 후보 선택과 방문 순서 자체를 보행 네트워크 기준으로 다시 최적화해야 한다는 방향으로 개선했다."),
    ("h2", "2.5 검증 분석 결과 생성 요청"),
    ("bullet", "동선 최적화를 통해 효율성이 얼마나 증가했는지 신뢰성 있게 검증하기 위한 분석 방법을 추천해 달라고 요청했다."),
    ("bullet", "이후 M0~M5 단계별 알고리즘 개선 효과, 고정 장보기 시나리오 10개, 입구별 분석, 무작위 반복 검증 100개, 상생형 경로 분석을 수행하는 스크립트와 결과 파일 생성을 요청했다."),
    ("bullet", "추가로 점포-보행 네트워크 연결거리 검증, 같은 점포 조합 기준 경로 유형 비교, 상생형 경로 재검토, final_validation_summary.md 수정까지 요청했다."),
    ("h1", "3. 수행한 개발 및 분석 과정"),
    ("h2", "3.1 Leaflet 웹 GIS 구성"),
    ("p", "웹 GIS는 OpenStreetMap 배경지도와 Leaflet을 기반으로 구성되었다. 점포 데이터는 직접 매칭 점포와 주변 권역 점포로 구분되며, 장보기 품목군, 업종, 거리 구간, 동일 좌표 점포 수 등을 속성으로 가진다."),
    ("p", "중앙시장 핵심 구역은 직접 매칭 점포의 분포를 이용한 연구용 추정 polygon으로 표시했고, 주변 상권 분석 범위 300m와 중심부·중간부·외곽부 거리 구간도 함께 시각화했다."),
    ("h2", "3.2 보행 네트워크 구축"),
    ("p", "사용자가 지도 위에서 직접 찍은 노드를 기반으로 보행 네트워크를 만들었다. 최종 네트워크는 노드 36개, 엣지 61개로 구성되며, 파일은 site/data/network_nodes.geojson과 site/data/network_edges.geojson에 저장되었다."),
    ("p", "엣지는 대전로797번길, 대전로791번길, 대전로785번길, 대전로779번길, 중교로, 중앙로194번길·200번길·204번길, 대전천 방향 접근축, 대전로 동측 접근축 등을 기준으로 연결했다."),
    ("h2", "3.3 경로 최적화 알고리즘 개선"),
    ("p", "초기 방식은 app.js에서 점포를 직선거리와 점포 점수 기준으로 먼저 선택하고, network-editor.js가 그 순서를 보행 네트워크 위에서 Dijkstra로 연결하는 구조였다. 이 방식은 점포 조합과 방문 순서가 이미 직선거리 기준으로 고정되어 있어 실제 골목 흐름과 맞지 않는 우회가 발생했다."),
    ("p", "개선 후에는 품목군별 후보 점포를 네트워크 비용으로 다시 평가하고, 선택된 점포들의 방문 순서를 Nearest-Neighbor와 2-opt로 보정한 뒤, 각 구간을 Dijkstra로 계산하도록 변경했다."),
    ("p", "지도에서는 굵은 선을 실제 보행 네트워크 본선으로 표시하고, 점포 좌표까지의 짧은 이동은 점선 접근 보조선으로 분리했다. 이로 인해 점포 좌표를 억지로 본 경로에 포함하면서 생기던 지그재그와 별 모양 왕복선이 줄어들었다."),
    ("h2", "3.4 경로 유형별 비용 함수"),
    ("bullet", "빠른 장보기: 엣지 길이를 중심으로 총 이동거리 최소화를 목표로 한다."),
    ("bullet", "초행자 친화형: 엣지 길이에 cognitive_cost를 더해 복잡한 골목과 인지 부담이 큰 경로를 피하도록 한다."),
    ("bullet", "넓은 길 우선형: 좁은 통로에는 벌점을 주고 주요 통로에는 보너스를 주어 큰 통로 중심 경로를 선호한다."),
    ("bullet", "상생형: 내부 골목과 덜 노출되는 주변 권역 점포 노출을 고려하되, 과도한 우회를 만들지 않도록 네트워크 비용을 함께 고려한다."),
    ("h1", "4. 검증 분석 과정"),
    ("h2", "4.1 단계별 알고리즘 비교"),
    ("p", "M0부터 M5까지 단계별 모델을 정의했다. M0은 직선거리 기반 기존 경로, M1은 기존 점포 선택 후 보행 네트워크 연결, M2는 후보 점포 네트워크 비용 재평가, M3는 Nearest-Neighbor 방문 순서 최적화, M4는 2-opt 개선, M5는 최종 경로 유형별 비용 함수 적용 모델이다."),
    ("p", "9개 장보기 품목군 전체 선택 조건에서 M1 상생형 기존 방식은 1,003.4m였고, M5 최종 상생형은 449.3m로 계산되었다. 이는 단순 방문 순서 최적화만의 효과가 아니라 후보 점포 재평가와 방문 순서 최적화가 함께 적용된 시스템 개선 효과로 설명했다."),
    ("h2", "4.2 고정 시나리오 및 입구별 분석"),
    ("p", "S1~S10까지 10개 고정 장보기 시나리오를 만들고, 각 시나리오에 대해 M0~M5 모델 결과를 비교했다. 또한 시장 중심점, 서측 대전천 방향, 동측 대전로 방향, 남측 신중앙시장 방향, 북측 중앙로 방향을 출발지로 바꿔 입구별 접근성 차이를 분석했다."),
    ("h2", "4.3 무작위 반복 검증"),
    ("p", "품목군 9개 중 3~5개를 무작위 선택하고 출발지도 무작위로 선택한 100개 시나리오를 생성했다. 각 모델별 총 거리, 예상 시간, 방향 전환 수, 인지 비용, 점포 접근거리, 내부 골목 통과율, 외곽부 점포 포함률, 경로 주변 20m 이내 점포 노출 수의 평균, 중앙값, 표준편차, 최소, 최대를 계산했다."),
    ("h2", "4.4 점포-보행 네트워크 연결거리 검증"),
    ("p", "추천 후보로 사용될 가능성이 높은 점포 238개를 대상으로 가장 가까운 보행 네트워크 노드와의 연결거리를 계산했다. 평균 연결거리는 28.6m, 중앙값은 23.63m, 20m 이내 비율은 28.99%, 50m 초과 점포는 18개, 100m 초과 점포는 3개로 나타났다."),
    ("h2", "4.5 상생형 경로 재검토"),
    ("p", "10개 고정 시나리오에서 상생형 경로의 외곽부 점포 포함률은 0.0%로 나타났다. 따라서 상생형을 외곽부 활성화 효과가 검증된 경로로 과장하지 않고, 내부 골목 및 주변 권역 점포 노출형 경로로 해석하도록 정리했다."),
    ("p", "외곽부 점포 최소 1개 포함 조건을 강제로 적용한 대안도 계산했다. 가능한 10개 시나리오에서 현재 상생형 대비 평균 거리 증가율은 83.93%로 나타나, 외곽부 점포 활성화는 별도의 정책 제약이 필요하다는 결론을 제시했다."),
    ("h1", "5. 생성된 주요 산출물"),
    ("bullet", "site/index.html: Leaflet 웹 GIS 기본 페이지"),
    ("bullet", "site/app.js: 점포 표시, 필터, 장보기 추천 UI 로직"),
    ("bullet", "site/network-editor.js: 보행 네트워크 편집, Dijkstra 경로 계산, 후보 점포 재평가, 방문 순서 최적화 로직"),
    ("bullet", "site/data/network_nodes.geojson: 보행 네트워크 노드 36개"),
    ("bullet", "site/data/network_edges.geojson: 보행 네트워크 엣지 61개"),
    ("bullet", "scripts/generate_validation_analysis.py: M0~M5 검증 분석 스크립트"),
    ("bullet", "scripts/generate_additional_validation_analysis.py: 연결거리 검증, 고정 점포 경로 유형 비교, 상생형 정책 진단 스크립트"),
    ("bullet", "analysis/algorithm_ablation_results.csv: 단계별 알고리즘 개선 효과 분석"),
    ("bullet", "analysis/scenario_validation_results.csv: 10개 고정 장보기 시나리오 분석"),
    ("bullet", "analysis/entrance_comparison_results.csv: 출발지/입구별 비교 분석"),
    ("bullet", "analysis/random_simulation_results.csv: 100개 무작위 반복 검증 요약"),
    ("bullet", "analysis/winwin_route_analysis.csv: 상생형 경로 분석"),
    ("bullet", "analysis/store_network_connection_quality.csv 및 .md: 점포-보행 네트워크 연결거리 검증"),
    ("bullet", "analysis/fixed_store_route_type_comparison.csv: 같은 점포 조합 기준 경로 유형 비교"),
    ("bullet", "analysis/winwin_policy_diagnostic.md: 상생형 경로 정책 진단"),
    ("bullet", "analysis/final_validation_summary.md: 최종 검증 요약 보고서"),
    ("h1", "6. 연구 보고서 작성 시 강조할 점"),
    ("bullet", "M0은 실제 성능 기준이 아니라 직선거리 왜곡 기준선으로 해석해야 한다."),
    ("bullet", "1,003m에서 449m 수준으로 줄어든 결과는 후보 점포 재평가와 방문 순서 최적화가 함께 적용된 최종 시스템 개선 효과이다."),
    ("bullet", "M4는 현재 9개 품목 실험에서 M3 대비 추가 개선이 없었으므로, 2-opt는 안전장치 또는 후처리 검증 단계로 설명하는 것이 적절하다."),
    ("bullet", "상생형은 현재 고정 시나리오에서 외곽부 점포 포함률이 0.0%이므로 외곽부 활성화 효과를 과장하지 말고, 내부 골목 및 주변 권역 점포 노출 효과 중심으로 설명해야 한다."),
    ("bullet", "보행 네트워크는 공식 보행로 데이터가 아니라 사용자가 직접 찍은 노드와 지도 이미지 해석을 바탕으로 만든 연구용 네트워크이므로, 현장조사나 QGIS 보정이 후속 연구로 필요하다."),
    ("h1", "7. 전체 사용 과정 요약"),
    ("p", "전체 과정은 연구 주제 구상 → 폴더 파일 분석 → 웹 GIS 오류 수정 → 보행 네트워크 노드 직접 구축 → 엣지 연결 및 검증 → Dijkstra 기반 경로 표시 → 후보 점포 재평가와 방문 순서 최적화 → 검증 분석 스크립트 작성 → 결과 CSV와 Markdown 보고서 생성 → 상생형 정책 해석 보완 순서로 진행되었다."),
    ("p", "이 과정에서 프로젝트는 단순 지도 시각화에서 출발해, 실제 보행 네트워크 기반 장보기 동선 추천과 효율성 검증까지 포함하는 GIS 기반 전통시장 공간 분석 탐구로 확장되었다."),
]


def p_xml(text, style=None, bullet=False):
    ppr = ""
    if style:
        ppr += f'<w:pStyle w:val="{style}"/>'
    if bullet:
        ppr += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    if ppr:
        ppr = f"<w:pPr>{ppr}</w:pPr>"
    return f"<w:p>{ppr}<w:r><w:t xml:space=\"preserve\">{escape(text)}</w:t></w:r></w:p>"

body = []
for kind, text in sections:
    if kind == "title":
        body.append(p_xml(text, "Title"))
    elif kind == "h1":
        body.append(p_xml(text, "Heading1"))
    elif kind == "h2":
        body.append(p_xml(text, "Heading2"))
    elif kind == "bullet":
        body.append(p_xml(text, bullet=True))
    else:
        body.append(p_xml(text))

document_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {''.join(body)}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>'''

styles_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:b/><w:sz w:val="30"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:b/><w:sz w:val="25"/></w:rPr></w:style>
</w:styles>'''

numbering_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>'''

content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>'''

rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

doc_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>'''

OUT.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", document_xml)
    z.writestr("word/styles.xml", styles_xml)
    z.writestr("word/numbering.xml", numbering_xml)
    z.writestr("word/_rels/document.xml.rels", doc_rels)

print(OUT)
