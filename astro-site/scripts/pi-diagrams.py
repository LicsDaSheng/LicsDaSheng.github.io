"""Regenerate the inline, accessible SVG figures in the Pi tutorial (no browser JS)."""
from pathlib import Path
from html import escape
import re

ROOT = Path(__file__).resolve().parents[1]
COLORS = ['#dcebf0', '#e9e0f0', '#edf0d2', '#f3dedb', '#faedb9']


class Diagram:
    def __init__(self, key, title, height):
        self.key, self.title, self.height = key, title, height
        self.parts = []

    def text(self, x, y, lines, size=19, anchor='middle'):
        for i, line in enumerate(lines):
            self.parts.append(f'<text x="{x}" y="{y+i*27}" text-anchor="{anchor}" font-size="{size}">{escape(line)}</text>')

    def box(self, x, y, w, lines, color=0, h=70):
        # Slightly irregular outlines and a second pencil stroke, with crisp text.
        d = f'M{x+12} {y+1} Q{x+w/2} {y-2} {x+w-12} {y} Q{x+w+1} {y} {x+w} {y+13} L{x+w-1} {y+h-12} Q{x+w} {y+h+1} {x+w-13} {y+h} Q{x+w/2} {y+h+2} {x+12} {y+h-1} Q{x-1} {y+h} {x} {y+h-13} L{x+1} {y+12} Q{x} {y} {x+12} {y+1}Z'
        self.parts.append(f'<path d="{d}" fill="{COLORS[color]}" stroke="#494940" stroke-width="1.8"/><path d="{d}" fill="url(#{self.key}-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/>')
        self.text(x+w/2, y+h/2+6-(len(lines)-1)*13.5, lines)

    def arrow(self, d, dashed=False):
        self.parts.append(f'<path d="{d}" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#{self.key}-arrow)"'+(' stroke-dasharray="5 5"' if dashed else '')+'/>')

    def render(self):
        k, h = self.key, self.height
        return f'''<figure class="pi-diagram">
<div class="pi-diagram-scroll" tabindex="0" role="region" aria-label="{self.title}，窄屏可横向滚动">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 {h}" width="720" height="{h}" role="img" aria-labelledby="{k}-title {k}-desc">
<title id="{k}-title">{self.title}</title><desc id="{k}-desc">流程的完整文字版本位于图后的可展开说明。</desc>
<defs><pattern id="{k}-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 9 9-2M5 12 12 5" stroke="#80775f" stroke-width=".65" opacity=".13"/></pattern><marker id="{k}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 8 5 1 9" fill="none" stroke="#4a4a42" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect x="3" y="3" width="714" height="{h-6}" rx="17" fill="#fffaf0" stroke="#8da4ad" stroke-width="1.8"/><rect x="6" y="5" width="708" height="{h-11}" rx="15" fill="none" stroke="#8da4ad" stroke-opacity=".3"/>
<g fill="#302d28" font-family="LXGW WenKai, Kaiti SC, KaiTi, serif">{''.join(self.parts)}</g>
</svg>
</div>
<figcaption>{self.title}</figcaption>
</figure>'''


def chain(key, title, steps):
    d = Diagram(key, title, 75 + len(steps)*110)
    d.text(35, 40, [title], 23, 'start')
    for i, step in enumerate(steps):
        y = 65+i*110
        d.box(95, y, 530, step.split('|'), i % 5, 76)
        if i < len(steps)-1:
            d.arrow(f'M360 {y+79} Q358 {y+92} 360 {y+104}')
    return d


figures = []
d = Diagram('pi-loop', '01 · Agent 循环：行动之后，再看结果', 680)
d.text(35, 42, [d.title], 23, 'start')
d.box(240, 75, 240, ['用户输入'])
d.box(240, 190, 240, ['请求模型'], 1)
d.box(240, 305, 240, ['模型响应'], 2)
d.arrow('M360 148 L360 183'); d.arrow('M360 263 L360 298')
d.box(60, 440, 260, ['工具调用 → 程序执行', '工具结果写入消息'], 3, 85)
d.box(400, 440, 260, ['普通回答', '判断是否继续运行'], 4, 85)
d.arrow('M300 378 C300 413 190 403 190 433')
d.arrow('M420 378 C420 413 530 403 530 433')
d.arrow('M60 480 C22 480 25 228 233 225')
d.text(94, 292, ['带回结果'], 17)
d.box(430, 585, 200, ['结束'], 2, 55)
d.arrow('M530 528 L530 578'); d.text(555, 563, ['结束'], 16, 'start')
d.arrow('M660 480 C705 480 704 224 487 225')
d.text(638, 292, ['继续'], 17)
figures.append(('01-agent-loop.md', 0, d))

figures.append(('01-agent-loop.md', 1, chain('pi-entry', '02 · 从应用输入到循环入口', [
    'AgentSession.prompt(text)|输入处理、模板展开、模型与认证检查',
    '_startRun(...)|_prepareRun(...)',
    'agent.prompt(messages)|normalizePromptInput(...)',
    'runPromptMessages(...)|runWithLifecycle(...)',
    'runAgentLoop(...)|runLoop(...)'])))
figures.append(('01-agent-loop.md', 2, chain('pi-tools', '03 · 工具执行：准备、校验与结果回写', [
    'prepareToolCall|按名称查找工具', 'prepareArguments|可选的参数预处理',
    'validateToolArguments|校验工具参数', 'beforeToolCall|执行前钩子，可以阻止执行',
    'executePreparedToolCall|tool.execute(id, args, signal, onUpdate)',
    'finalizeExecutedToolCall|afterToolCall（可调整结果）', 'createToolResultMessage|生成工具结果消息'])))

d = chain('pi-events', '04 · 一次运行，两个回合', [
    'agent_start', 'turn_start · 第一回合',
    '用户消息 U：message_start → message_end',
    '响应 A1：message_start|→ message_update* → message_end',
    'tool_execution_start(call_1)|→ tool_execution_update* → tool_execution_end',
    '工具结果 R1：message_start → message_end',
    'turn_end(A1, [R1])', 'turn_start · 第二回合',
    '响应 A2：message_start|→ message_update* → message_end',
    'turn_end(A2, [])', 'agent_end · * 表示零次或多次'])
figures.append(('01-agent-loop.md', 3, d))

d = Diagram('pi-map', '05 · 核心调用链与事件通道', 810)
d.text(35, 42, [d.title], 23, 'start')
steps = ['Agent.prompt', 'runPromptMessages / runWithLifecycle', 'runAgentLoop → runLoop',
         'streamAssistantResponse|transformContext → convertToLlm → streamFunction',
         'executeToolCalls|prepareToolCall → tool.execute|→ finalizeExecutedToolCall',
         '结果回写 → finishTurn|继续或结束']
for i, step in enumerate(steps):
    y = 70+i*105
    d.box(35, y, 530, step.split('|'), i % 5, 90)
    if i < 5: d.arrow(f'M300 {y+92} L300 {y+100}')
    d.arrow(f'M568 {y+45} L620 {y+45}', True)
d.parts.append('<path d="M625 110 Q630 370 625 685" stroke="#8b7b9d" stroke-width="2" stroke-dasharray="6 5" fill="none"/>')
d.arrow('M625 685 Q625 718 560 728', True)
d.box(115, 700, 450, ['processEvents', '在各个事件发出时更新状态、通知监听器'], 1, 80)
figures.append(('01-agent-loop.md', 4, d))

figures.append(('02-pi-ai.md', 0, chain('pi-read', '06 · 读取资料：两次模型请求的协作', [
    '用户输入|读取已授权资料，提取三个要点',
    '第一次模型响应|请求调用 read_material',
    '程序检查参数与授权|执行读取', '工具结果进入消息历史',
    '第二次模型响应|根据资料生成要点'])))
figures.append(('02-pi-ai.md', 1, chain('pi-boundary', '07 · 消息转换的三层边界', [
    '应用数据', 'Pi 规范化消息', '提供商请求数据'])))
figures.append(('02-pi-ai.md', 2, chain('pi-provider', '08 · 从 Agent 到模型服务', [
    'Agent 的 streamAssistantResponse', '注入的 streamFn', 'ModelRuntime.streamSimple',
    'prepareRequest|准备提供商、模型和请求选项', 'prepared.provider.streamSimple',
    'createProvider 中的 dispatch', '对应 API 的 streamSimple', '对应 API 的 stream',
    '提供商 SDK|请求与响应转换'])))

for filename in dict.fromkeys(f[0] for f in figures):
    path = ROOT / 'src/content/posts/pi-tutorial' / filename
    content = path.read_text()
    for _, index, diagram in (f for f in figures if f[0] == filename):
        marker = rf'<!-- pi-diagram:{diagram.key}:start -->.*?<!-- pi-diagram:{diagram.key}:end -->'
        previous = re.search(marker, content, re.S)
        if previous:
            original = re.search(r'```text\n.*?```', previous.group(), re.S).group()
        else:
            blocks = [m.group() for m in re.finditer(r'```text\n(.*?)```', content, re.S)
                      if any(c in m.group(1) for c in ['↓', '→', '├'])]
            original = blocks[index]
        replacement = f'<!-- pi-diagram:{diagram.key}:start -->\n{diagram.render()}\n\n<details class="pi-diagram-source">\n<summary>展开文字链路（可复制）</summary>\n\n{original}\n\n</details>\n<!-- pi-diagram:{diagram.key}:end -->'
        content = content[:previous.start()] + replacement + content[previous.end():] if previous else content.replace(original, replacement, 1)
    path.write_text(content)
