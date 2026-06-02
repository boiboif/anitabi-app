### 通过devtools分析得出anitabi.cn圣地巡礼地图数据结构和处理逻辑。

因为在月初去日本旅行，使用anitabi网站感觉用户体验不太好，后续打算自己开发一个自用的圣地巡礼app。由于anitabi官方的开放接口文档不是很全，所以通过分析其页面请求获取相应的数据源和数据结构。

1. 进入地图页面后，会请求几个关键接口获取巡礼点数据

- https://www.anitabi.cn/d/g0.json?d=qhs3 （只有首次进入页面时，会发送5个请求g0-g5.json）

```ts
// 返回数据示例 值为0代表空 any[][]
[
  [
    106372, // bangumiId
    [
      '/images/ptheme/106372_100_76.webp?v=h4bdc', // theme.src
      [
        // theme.ids
        'nstqa5i3w',
      ],
      1725289939638, // theme.modified
      100, // theme.w
      76, // theme.h
    ],
    [
      [
        'kuk6a9t6z', // id
        'JR西宮駅前交差点', // name
        0, // cn
        0, // isFolder
        0, // mid
        1057, // uid
        '/images/points/226956/kuk6a9t6z_1716960301789.jpg', // image
        0, // fid
        null, // ep
        '', // s
        '位于佐知子的公司附近。', // mark
        0, // origin
        0, // originLink
        '兵库', // folder
        10358, // density
      ],
    ],
    1725342953859, // modified
  ],
];
```

- https://www.anitabi.cn/d/g.json?d=qhs2

```ts
// 返回数据示例 值为0代表空 [any[][], number, number]
[
  [
    [
      226956, // id
      '', // cn
      0, // en
      'SeaBed', // title
      '神户市', // city
      '#53abb2', // color
      '/images/bangumi/226956.jpg', // cover
      8.5, // fade
      '游戏', // cat
      6.19643, // geo[0]
      134.099687, // geo[1]
      1.1, // zoom
      [
        // 这里会有多个点
        'kuk6a9t6z', // points[0].id
        34.737722, // points[0].geo[0]
        135.347341, // points[0].geo[1]
        1272, // points[0].priority、
        '4ui73krj7', // points[1].id
        35.694206, // points[11].geo[0]
        139.700618, // points[1].geo[1]
        2, // points[1].priority
      ],
      0, // abbr 缩写
      0, // tags 值除了0还可能是空数组
      null, // priority
      '/images/icon/226956.jpg', // icon
    ],
  ],
  250,
  1780056279581,
];
```

3. 之后会对数据进行组装，数据结构如下

```ts
type Data = {
  data: {
    bangumis: Bangumi[];
    modified: number;
  };
  id: string;
  ms: number;
};

type Bangumi = {
  id: number; // bangumiId
  cn?: string; // 番剧中文名称
  en?: string; // 番剧英文名称
  title?: string; // 番剧标题
  city?: string; // 城市
  color?: string; // 颜色
  cover?: string; // 封面地址
  fade?: number; // 淡入度？
  cat?: string; // 分类
  geo?: [number, number]; // 位置
  zoom?: number; // 地图缩放度
  modified?: number; // 修改时间戳
  points?: {
    id: string;
    name?: string; // 点位名称
    cn?: string; // 点位中文名称
    isFolder: boolean;
    mid?: string;
    uid?: number;
    image?: string; // 点位图片地址
    fid?: string;
    ep?: number; // 点位发生在集数
    s?: number; // 点位发生在集数的第几秒
    mark?: string; // 点位备注信息
    origin?: string; // 来源
    originLink?: string; // 来源地址
    folder?: string;
    density?: number; // 密度
    priority: number; // 优先级 越大优先级越高
    geo: [number, number]; // 地理位置
  }[];
  theme: {
    // 主题
    h: number; // 高度
    ids: string[]; // ids
    modified: number; // 修改时间戳
    src: string; // 图片地址
    w: number; // 宽度
  };
  abbr?: string; // 缩写
  tags?: string[]; // 标签
  priority?: number; // 优先级 越大优先级越高
  icon?: string; // 图标地址
};
```

## anitabi官方开放api文档地址

https://github.com/anitabi/anitabi.cn-document/blob/main/api.md

## bangumi接口文档地址 (已经被墙了，不建议用了)

https://bangumi.github.io/api/#/
