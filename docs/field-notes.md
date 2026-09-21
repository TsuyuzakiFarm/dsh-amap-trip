# 高德接口探活记录（P0）

- 生成时间：2026-09-21T13:28:51.355Z
- 使用凭据变量名：AMAP_WS_KEY
- 原始响应：docs/samples/*.json

| 接口 | HTTP | status | info | infocode | 结构 |
|---|---:|---:|---|---:|---|
| v3-geocode | 200 | 1 | OK | 10000 | status=1 info=OK infocode=10000 count=2 geocodes[2] |
| v3-regeo | 200 | 1 | OK | 10000 | status=1 regeocode{addressComponent,formatted_address} info=OK infocode=10000 |
| v5-driving | 200 | 1 | OK | 10000 | status=1 info=OK infocode=10000 count=3 route{origin,destination,taxi_cost,paths} |
| v3-around | 200 | 1 | OK | 10000 | suggestion{keywords,cities} count=600 infocode=10000 pois[5] status=1 info=OK |
| v5-around | 200 | 1 | OK | 10000 | count=5 infocode=10000 pois[5] status=1 info=OK |
| v3-text | 200 | 1 | OK | 10000 | suggestion{keywords,cities} count=508 infocode=10000 pois[3] status=1 info=OK |
| v3-traffic-rect | 200 | 1 | OK | 10000 | status=1 info=OK infocode=10000 trafficinfo{description,evaluation} |
| v3-weather | 200 | 1 | OK | 10000 | status=1 count=1 info=OK infocode=10000 lives[1] |

## 关键字段摘录

- v3-geocode:  | addr=北京市朝阳区阜通东大街6号 loc=116.482086,39.990496
- v3-regeo:  | addr=北京市朝阳区望京街道方恒国际中心A座
- v5-driving:  | dist=14499m dur=undefineds steps=11 polyChars=62
- v3-around:  | poi0=方恒假日酒店宴会厅 / 望京阜通东大街6号院3号楼北京方恒假日酒店2-3层 / type=050100
- v5-around:  | poi0=手拉手劳务公司朝阳分公司 / 望京阜通东大街6号院 / type=070800
- v3-text:  | poi0=北京十一学校 / 玉泉路66号 / type=141202
- v3-weather:  | 北京东城区 晴 23C

## 结论（待填）

- 凭据平台权限：
- 需补充：
