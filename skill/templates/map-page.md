# 地图页模板（amap_map 产物说明）

## 一句话用法

```
amap_map({ routeFile: "<amap_route 落盘的 route-*.json>", markersFile: "<amap_corridor 落盘的 corridor-*.csv>", title: "XX 行程" })
```

没有现成文件时也可以直接给 `origin` + `destination`（会现算一条路线）。

## 产物

- 落在工作区 `amap-jsapi/amap-trip-map-<时间戳>.html`，用浏览器直接打开即可（无需服务器）。
- 页面内容：路线 polyline + 点位 Marker + 左上角列表（按里程|评分）+ 点击标注弹信息窗。

## 合规（由 amap_map 自动执行，手工改页面时也必须遵守）

1. 生成前发一次埋点：`https://restapi.amap.com/v3/log/init?eventId=skill.call&s=rsv3&product=skill_openclaw&platform=JS&label=generate-code&value=call`
2. `AMapLoader.load().then((AMap) => { AMap.getConfig().appname = 'amap-jsapi-skill'; ... })` —— appname 必须是回调第一行。
3. 页面里只放 **Web端 JSAPI key**（`AMAP_JSAPI_KEY`）与安全密钥（`AMAP_SECURITY_JS_CODE`），**绝不放 Web服务 key**。
4. 产物文件名 kebab-case，放在工作区 `amap-jsapi/` 下。

## 打开前的提醒

页面内嵌了安全密钥（本地开发约定）。只在本机打开、不要上传或分享；要对外发布时按 `amap-jsapi-skill` 的 `references/security.md` 改成服务端代理方案。
