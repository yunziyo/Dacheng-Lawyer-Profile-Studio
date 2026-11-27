 

const layouts = {
  quiet: {
    hero: 65,
    about: 260,
    practice: 50,
    record: 170,
    achievement: 180,
    focus: 2,
    description: "首页一句简介，详细履历放入关于栏目",
  },
  editorial: {
    hero: 80,
    about: 180,
    practice: 75,
    record: 160,
    achievement: 190,
    focus: 3,
    description: "简介呈现为杂志引语，经历分条排列",
  },
  deep: {
    hero: 55,
    about: 160,
    practice: 45,
    record: 135,
    achievement: 160,
    focus: 2,
    description: "深紫首屏适合短句，专业方向分成短卡片",
  },
  archive: {
    hero: 70,
    about: 170,
    practice: 65,
    record: 155,
    achievement: 155,
    focus: 2,
    description: "履历使用时间轴，建议每段经历单独成条",
  },
  orbit: {
    hero: 45,
    about: 130,
    practice: 28,
    record: 120,
    achievement: 130,
    focus: 2,
    description: "居中首屏与环形卡片，专业方向使用短标题",
  },
  grid: {
    hero: 65,
    about: 150,
    practice: 48,
    record: 120,
    achievement: 145,
    focus: 3,
    description: "网格分栏，业务和经历各自拆成短条",
  },
} as const;

export async function GET(): Promise<Response> {
  const body = {
    layouts,
    aiPlatforms: ["deepseek-harness"],
    handoffMinutes: 15,
    localMode: false,
  };

  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
