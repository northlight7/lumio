import { Fragment, type ReactNode } from 'react'
import type { Locale } from '@/lib/types'
import './conversation-text.css'

type Block =
  | { kind:'paragraph'; lines:string[] }
  | { kind:'code'; language:string; text:string }
  | { kind:'list'; ordered:boolean; items:{ text:string; number?:number }[] }

// Deliberately bounded formatting. URLs, images and raw HTML remain inert text.
function inline(text:string, allowBold=true):ReactNode[] {
  const tokens = allowBold ? /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g : /(`[^`\n]+`)/g
  const nodes:ReactNode[] = []
  let offset = 0
  for (const match of text.matchAll(tokens)) {
    const at = match.index!
    if (at > offset) nodes.push(text.slice(offset,at))
    const token = match[0]
    nodes.push(token.startsWith('**')
      ? <strong key={at}>{inline(token.slice(2,-2),false)}</strong>
      : <code key={at}>{token.slice(1,-1)}</code>)
    offset = at + token.length
  }
  if (offset < text.length) nodes.push(text.slice(offset))
  return nodes
}

function listItem(line:string) {
  const ordered = /^ {0,3}(\d{1,6})[.)]\s+(.+)$/.exec(line)
  if (ordered) return { ordered:true, number:Number(ordered[1]), text:ordered[2] }
  const bullet = /^ {0,3}[-*+]\s+(.+)$/.exec(line)
  return bullet ? { ordered:false, text:bullet[1] } : null
}

function blocks(text:string):Block[] {
  const lines = text.replace(/\r\n?/g,'\n').split('\n')
  const result:Block[] = []
  let at = 0
  while (at < lines.length) {
    if (!lines[at].trim()) { at++; continue }
    const fence = /^ {0,3}(`{3,}|~{3,})(?:[ \t]*([A-Za-z0-9_+-]{1,30}))?[ \t]*$/.exec(lines[at])
    if (fence) {
      const end = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`)
      const content:string[] = []
      at++
      while (at < lines.length && !end.test(lines[at])) content.push(lines[at++])
      if (at < lines.length) at++
      result.push({kind:'code',language:fence[2] || '',text:content.join('\n')})
      continue
    }
    const first = listItem(lines[at])
    if (first) {
      const items:{text:string;number?:number}[] = []
      while (at < lines.length) {
        const item = listItem(lines[at])
        if (!item || item.ordered !== first.ordered) break
        items.push({text:item.text,...(item.ordered ? {number:item.number} : {})})
        at++
      }
      result.push({kind:'list',ordered:first.ordered,items})
      continue
    }
    const paragraph:string[] = []
    do { paragraph.push(lines[at++]) } while (at < lines.length && lines[at].trim() && !listItem(lines[at]) && !/^ {0,3}(?:`{3,}|~{3,})/.test(lines[at]))
    result.push({kind:'paragraph',lines:paragraph})
  }
  return result
}

export function ConversationText({text,locale='en'}:{text:string;locale?:Locale}) {
  return <div className="conversation-text">{blocks(text).map((block,index) => {
    if (block.kind === 'paragraph') return <p key={index}>{block.lines.map((line,lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br/>}{inline(line)}</Fragment>)}</p>
    if (block.kind === 'code') return <div className="conversation-code" key={index}>{block.language && <span className="conversation-code-language">{block.language}</span>}<pre tabIndex={0} aria-label={locale === 'zh' ? '程式碼摘錄' : 'Code excerpt'}><code>{block.text}</code></pre></div>
    const items = block.items.map((item,itemIndex) => <li key={itemIndex} value={block.ordered ? item.number : undefined}>{inline(item.text)}</li>)
    return block.ordered ? <ol key={index} start={block.items[0]?.number}>{items}</ol> : <ul key={index}>{items}</ul>
  })}</div>
}
