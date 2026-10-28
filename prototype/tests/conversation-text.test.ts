import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe,it,expect } from 'vitest'
import { ConversationText } from '../src/components/conversation-text'
const render = (text:string,locale:'en'|'zh'='en') => renderToStaticMarkup(createElement(ConversationText,{text,locale}))

describe('safe readable colleague conversation formatting',()=>{
  it('separates paragraphs and preserves explicit human line breaks and bilingual text',()=>{
    const html=render('First observation.\r\nSecond line.\r\n\r\n下一步：核對原始數據。','zh')
    expect(html).toContain('<p>First observation.<br/>Second line.</p>')
    expect(html).toContain('<p>下一步：核對原始數據。</p>')
  })
  it('renders numbered checks with their supplied numbering, bullets, bold labels and inline field names',()=>{
    const html=render('**Quick checks**\n\n3. Check `page`.\n5. Preserve **`limit`**.\n\n- Confirm the source.\n- 記錄限制。')
    expect(html).toContain('<strong>Quick checks</strong>')
    expect(html).toContain('<ol start="3"><li value="3">Check <code>page</code>.</li><li value="5">Preserve <strong><code>limit</code></strong>.</li></ol>')
    expect(html).toContain('<ul><li>Confirm the source.</li><li>記錄限制。</li></ul>')
  })
  it('keeps fenced code literal, keyboard-scrollable and isolated from prose formatting',()=>{
    const html=render('Use this check:\n\n```ts\nconst message = "**literal** <script>not active</script>"\n\n- not a list\n```\n\nThen review the result.')
    expect(html).toContain('class="conversation-code-language">ts</span>')
    expect(html).toContain('<pre tabindex="0" aria-label="Code excerpt"><code>')
    expect(html).toContain('**literal** &lt;script&gt;not active&lt;/script&gt;')
    expect(html).toContain('- not a list')
    expect(html).not.toContain('<ul>')
    expect(html).toContain('<p>Then review the result.</p>')
  })
  it('never activates raw HTML, script, markdown images or unsafe URL markup',()=>{
    const hostile='<script>alert(1)</script>\n<img src="https://tracker.example/pixel" onerror="alert(2)">\n![image](https://tracker.example/pixel)\n[open](javascript:alert(3))\n<svg onload="alert(4)"></svg>'
    const html=render(hostile)
    expect(html).not.toMatch(/<(script|img|a|svg|iframe)\b/i)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=')
    expect(html).toContain('![image](https://tracker.example/pixel)')
    expect(html).toContain('[open](javascript:alert(3))')
  })
  it('escapes HTML embedded in bold labels or inline code as ordinary text',()=>{
    const html=render('**<img src=x onerror=alert(1)>** and `<a href="javascript:alert(2)">link</a>`')
    expect(html).not.toMatch(/<(img|a)\b/i)
    expect(html).toContain('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>')
    expect(html).toContain('<code>&lt;a href=')
  })
  it('preserves ordinary punctuation, equations and unfinished inline markup',()=>{
    const html=render('2 + 2 = 4.\n-5 records is invalid.\n**unfinished label and `unfinished field')
    expect(html).toContain('2 + 2 = 4.')
    expect(html).toContain('-5 records is invalid.')
    expect(html).toContain('**unfinished label and `unfinished field')
    expect(html).not.toMatch(/<(ol|ul|strong|code)\b/)
  })
  it('keeps an unfinished fenced block readable and uses the Chinese accessibility label',()=>{
    const html=render('~~~sql\nSELECT 1 < 2;\n**not bold**','zh')
    expect(html).toContain('aria-label="程式碼摘錄"')
    expect(html).toContain('SELECT 1 &lt; 2;\n**not bold**')
    expect(html).not.toContain('<strong>')
  })
})
