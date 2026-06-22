# Vercel 임시 배포 방법

이 프로젝트는 `site` 폴더 안의 HTML, CSS, JavaScript, GeoJSON 데이터를 그대로 제공하는 정적 웹 GIS이다. 별도의 Node 빌드 과정은 필요하지 않다.

## GitHub 저장소를 Vercel에 연결하는 경우

1. Vercel에 로그인한다.
2. `Add New Project`를 선택한다.
3. GitHub에 올려둔 `daejeon-jungang-market-gis` 저장소를 Import한다.
4. Framework Preset은 `Other` 또는 자동 감지 상태로 둔다.
5. Build Command는 비워둔다.
6. Output Directory도 비워둔다.
7. Deploy를 누른다.

루트의 `vercel.json`이 `site/index.html`, `site/app.js`, `site/styles.css`, `site/data/*`를 배포 URL의 루트 경로에서 접근되도록 처리한다.

## 로컬에서 Vercel CLI로 배포하는 경우

```bash
vercel
```

운영 배포가 필요하면 다음 명령을 사용한다.

```bash
vercel --prod
```

## 주의

- 이 프로젝트는 OpenStreetMap 타일과 Leaflet CDN을 외부에서 불러온다.
- Vercel 배포 후 지도가 보이지 않으면 브라우저 콘솔에서 외부 CDN 또는 지도 타일 요청이 차단되었는지 확인한다.
- `.vercelignore`에 분석 결과, QGIS 작업 파일, 제출용 압축 파일을 제외해두었으므로 실제 웹 구동에 필요한 `site` 폴더 중심으로 배포된다.
