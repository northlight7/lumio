import type { ReactNode } from 'react'
import { Check, Dot, Paper, PerspectiveBox, polygon, project, type Perspective } from './role-art-primitives'

const chipCamera: Perspective = { centerX: 160, groundY: 157, horizonY: -50, distance: 500, focal: 500 }
const stackCamera: Perspective = { centerX: 208, groundY: 150, horizonY: -80, distance: 480, focal: 480 }
const line = (points: [number, number][]) => points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`).join(' ')
const gearPath = (cx: number, cy: number, root: number, tip: number) => {
  const halfTooth = 8
  const shoulder = Math.sqrt(root * root - halfTooth * halfTooth)
  const toothPoint = (tooth: number, radial: number, tangent: number) => {
    const angle = tooth * 36 * Math.PI / 180
    return `${(cx + Math.cos(angle) * radial - Math.sin(angle) * tangent).toFixed(3)} ${(cy + Math.sin(angle) * radial + Math.cos(angle) * tangent).toFixed(3)}`
  }
  // Flat tooth faces are perpendicular to their radial centreline. Each root
  // shoulder lies on the same circle, so the valleys join without zigzags.
  return `M${toothPoint(0, shoulder, -halfTooth)} ` + Array.from({ length: 10 }, (_, tooth) =>
    `L${toothPoint(tooth, tip, -halfTooth)} L${toothPoint(tooth, tip, halfTooth)} L${toothPoint(tooth, shoulder, halfTooth)} A${root} ${root} 0 0 1 ${toothPoint(tooth + 1, shoulder, -halfTooth)}`
  ).join(' ') + ' Z'
}

export function technicalRoleScene(roleId: string): ReactNode | null {
  switch (roleId) {
    case 'ai-engineer': {
      const p = (x: number, z: number, height: number) => project(x, z, height, chipCamera)
      return <>
        <g className="art-entrance">
          <path d="M55 85 82 101m188-16-27 16M48 166l35-19m189 20-28-20" className="art-link" />
          <Dot x={55} y={85} color="art-cyan" r={10} /><Dot x={270} y={85} color="art-pink" r={10} />
          <Dot x={48} y={166} color="art-yellow" r={9} /><Dot x={272} y={167} color="art-coral" r={9} />
          <PerspectiveBox width={125} depth={125} height={95} camera={chipCamera}>
            <polygon points={polygon([p(-25,-25,96),p(25,-25,96),p(25,25,96),p(-25,25,96)])} className="art-object" />
            <polygon points={polygon([p(-17,-17,97),p(17,-17,97),p(17,17,97),p(-17,17,97)])} className="art-violet" />
            {[35,49,63].map(height => <g key={height}><path d={line([p(-62.5,-42,height),p(-62.5,39,height)])} className="art-rule" /><path d={line([p(-42,-62.5,height),p(39,-62.5,height)])} className="art-rule" /></g>)}
            {[-13,0,13].map(value => <g key={value}><path d={line([p(value,-25,96),p(value,-34,96)])} className="art-rule" /><path d={line([p(-25,value,96),p(-34,value,96)])} className="art-rule" /></g>)}
            <Dot x={p(37,-62.5,19)[0]} y={p(37,-62.5,19)[1]} color="art-cyan" r={3.5} />
          </PerspectiveBox>
        </g><g className="art-detail"><Check x={252} y={41} /></g>
      </>
    }
    case 'data-analyst': return <>
      <g className="art-entrance"><Paper x={48} y={36} width={217} height={141}>
        <Dot x={69} y={53} color="art-coral" r={3} /><Dot x={81} y={53} color="art-yellow" r={3} /><Dot x={93} y={53} r={3} />
        <path d="M76 105h155m-155 24h155" className="art-rule" style={{ opacity: .2, strokeWidth: 1.5, strokeDasharray: '3 7' }} />
        <g className="art-chart" style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}>
          <path d="M94 153v-29q0-5 5-5h15q5 0 5 5v29Z" className="art-violet" />
          <path d="M138 153v-40q0-5 5-5h15q5 0 5 5v40Z" className="art-cyan" />
          <path d="M182 153V97q0-5 5-5h15q5 0 5 5v56Z" className="art-bright" />
        </g>
        <path d="M75 70v83h155m-124 0v5m44-5v5m44-5v5" className="art-rule" />
        <path d="M85 103 111 89 151 91 192 74 225 80" className="art-bright-line" />
        {[{x:111,y:89},{x:151,y:91},{x:192,y:74},{x:225,y:80}].map(point => <Dot key={point.x} x={point.x} y={point.y} r={3.5} />)}
      </Paper></g>
      <g className="art-detail"><circle cx="271" cy="183" r="25" className="art-depth" /><circle cx="266" cy="177" r="25" className="art-coral" /><path d="M266 160v17l12 8" className="art-dark-line" /></g>
    </>
    case 'frontend-developer': return <>
      <g className="art-entrance"><Paper x={40} y={31} width={218} height={154}>
        <Dot x={60} y={49} color="art-coral" r={3} /><Dot x={72} y={49} color="art-yellow" r={3} /><Dot x={84} y={49} color="art-cyan" r={3} />
        <rect x="56" y="73" width="62" height="92" rx="7" className="art-pink" /><rect x="131" y="73" width="107" height="34" rx="7" className="art-violet" />
        <rect x="131" y="119" width="47" height="46" rx="7" className="art-cyan" /><rect x="190" y="119" width="48" height="46" rx="7" className="art-pink" />
        <path d="M69 91h36m-36 12h26m-26 12h31" className="art-dark-line" />
      </Paper></g>
      <g className="art-detail"><path d="M222 118v48l13-12 16 25 11-7-16-24h21Z" className="art-yellow" /></g>
    </>
    case 'software-developer': return <>
      <g className="art-entrance"><Paper x={39} y={35} width={210} height={136}>
        <Dot x={59} y={52} color="art-coral" r={3} /><Dot x={71} y={52} color="art-yellow" r={3} /><Dot x={83} y={52} color="art-cyan" r={3} />
        <path d="m95 87-21 17 21 17m90-34 21 17-21 17m-35-38-15 54" className="art-bright-line" /><path d="M73 146h39m9 0h24m9 0h47" className="art-rule" />
      </Paper></g>
      <g className="art-detail"><path d="M228 132h38l19 19v44h-57Z" className="art-depth" /><path d="M222 126h38l19 19v44h-57Z" className="art-violet" /><path d="M260 126v19h19Z" className="art-face" /><path d="m237 157-7 7 7 7m25-14 7 7-7 7" className="art-dark-line" /></g>
      <Check x={60} y={178} />
    </>
    case 'full-stack-developer': return <>
      <g className="art-entrance"><Paper x={32} y={29} width={148} height={110}>
        <rect x="47" y="63" width="43" height="52" rx="6" className="art-violet" /><path d="M102 70h57m-57 14h43m-43 14h33" className="art-rule" />
      </Paper>
      {[0,26,52].map((elevation,index) => {
        const p = (x: number,z: number,height: number) => project(x,z,height,stackCamera)
        const led = p(43,-50,elevation+9)
        return <PerspectiveBox key={elevation} width={140} depth={100} height={18} elevation={elevation} camera={stackCamera} top={index===2?'art-bright':index===1?'art-violet':'art-face'} left="art-shade" right={index===0?'art-depth':'art-face'}>
          <path d={line([p(-70,-25,elevation+9),p(-70,25,elevation+9)])} className="art-rule" />
          <Dot x={led[0]} y={led[1]} color="art-cyan" r={3} />
        </PerspectiveBox>
      })}</g>
    </>
    case 'qa-engineer': return <>
      <g className="art-entrance"><Paper x={47} y={41} width={218} height={141}>
        <path d="M70 98h61m-61 23h43m-43 23h54" className="art-rule" />
        <circle cx="195" cy="117" r="33" className="art-cyan" /><ellipse cx="195" cy="117" rx="13" ry="19" className="art-object" />
        <path d="M195 101v32m-11-26-10-8m10 18h-13m13 10-10 8m32-28 10-8m-10 18h13m-13 10 10 8" className="art-dark-line" />
      </Paper></g>
      <g className="art-detail"><Check x={244} y={44} /><rect x="55" y="160" width="41" height="32" rx="7" className="art-violet" /><path d="m65 176 6 5 13-13" className="art-dark-line" /></g>
    </>
    case 'security-analyst': return <>
      <g className="art-entrance">
        <path d="m88 49 80-23 80 23v62q0 49-80 85-80-36-80-85Z" className="art-depth" />
        <path d="m80 39 80-23 80 23v62q0 49-80 85-80-36-80-85Z" className="art-cyan" />
        <path d="m96 53 64-19 64 19v46q0 36-64 66-64-30-64-66Z" className="art-shade" />
        <path d="M139 99V78a21 21 0 0 1 42 0v21" className="art-rule" /><rect x="129" y="97" width="62" height="49" rx="10" className="art-object" /><Dot x={160} y={117} color="art-yellow" r={5} /><path d="M160 122v11" className="art-rule" />
      </g>
      <g className="art-detail"><path d="M43 78h35m-42 19h42m-30 19h30m164-51h31m-31 19h40" className="art-bright-line" /><Dot x={279} y={65} color="art-violet" r={4} /></g>
    </>
    case 'pcb-designer': return <>
      <g className="art-entrance"><g transform="rotate(-9 160 115)">
        <rect x="56" y="48" width="211" height="143" rx="13" className="art-depth" /><rect x="48" y="37" width="211" height="143" rx="13" className="art-bright" />
        <rect x="62" y="51" width="183" height="114" rx="5" className="art-shade" />
        <path d="M85 65v25h30m-30 65v-39h30m73-26h30V68m-30 48h30v40m-65-82V60h42" className="art-circuit" />
        <rect x="121" y="81" width="59" height="58" rx="5" className="art-object" /><rect x="132" y="92" width="37" height="36" rx="3" className="art-face" />
        <path d="M131 74v7m11-7v7m11-7v7m11-7v7m-33 58v8m11-8v8m11-8v8m11-8v8m-49-57h6m-6 13h6m-6 13h6m59-26h8m-8 13h8m-8 13h8" className="art-rule" />
        <Dot x={85} y={65} color="art-yellow" r={5} /><Dot x={218} y={68} color="art-cyan" r={5} /><Dot x={218} y={156} color="art-coral" r={5} />
        <rect x="79" y="103" width="20" height="12" rx="3" className="art-coral" /><rect x="204" y="96" width="27" height="12" rx="3" className="art-violet" />
      </g></g>
    </>
    case 'mechanical-design-engineer': return <>
      <g className="art-entrance"><path d={gearPath(128,121,60,76)} transform="translate(6 6)" className="art-depth" /><path d={gearPath(128,121,60,76)} className="art-coral" /><circle cx="128" cy="121" r="37" className="art-shade" /><circle cx="128" cy="121" r="21" className="art-object" /></g>
      <g className="art-detail">
        <rect x="253" y="38" width="13" height="161" rx="2" className="art-object" style={{ fill: 'var(--muted)', stroke: 'none' }} />
        <path d="M253 44h-32l-6 6v7h38Zm13 0h12l6-5v12h-18Z" fill="var(--muted)" />
        {Array.from({length:19},(_,index) => <path key={index} d={`M${index%5===0?256:259} ${66+index*7}h${index%5===0?8:5}`} className="art-dark-line" style={{ strokeWidth: 1.2 }} />)}
        <path d="M253 124h-38v8l6 6h32Zm13 0h18v12l-6-5h-12Z" fill="var(--muted)" />
        <path d="M245 114h29v32h-29Z M253 120v20h13v-20Z" fillRule="evenodd" className="art-cyan" />
        {[121,125,129,133,137].map(y => <path key={y} d={`M247 ${y}h4`} className="art-dark-line" style={{ strokeWidth: 1.2 }} />)}
        <circle cx="270" cy="110" r="4" className="art-yellow" />
        <path d="M256 150h8" className="art-dark-line" style={{ strokeWidth: 1.2 }} />
      </g>
    </>
    case 'laboratory-analyst': return <>
      <g className="art-entrance">
        <path d="M139 33h42v65l44 76q13 23-13 23H108q-26 0-13-23l44-76Z" className="art-object" /><path d="M114 148h92l18 32q7 10-12 10H108q-19 0-12-10Z" className="art-cyan" /><path d="M136 32h48" className="art-bright-line" />
        <path d="M67 66h27v80q0 28-27 0Z" className="art-object" /><path d="M71 115h19v31q0 17-19 0Z" className="art-pink" /><path d="M64 66h33" className="art-rule" />
        <path d="M239 69h27v78q0 28-27 0Z" className="art-object" /><path d="M243 106h19v41q0 17-19 0Z" className="art-bright" /><path d="M236 69h33" className="art-rule" />
        <g className="art-detail"><Dot x={144} y={168} color="art-object" r={6} /><Dot x={168} y={156} color="art-object" r={4} /><Dot x={185} y={179} color="art-object" r={5} /></g>
      </g><Check x={221} y={45} />
    </>
    case 'research-analyst': return <>
      <g className="art-entrance"><Paper x={49} y={34} width={174} height={155}>
        <path d="M71 76h128m-128 17h128m-128 17h70" className="art-rule" /><rect x="73" y="135" width="30" height="31" rx="5" className="art-violet" /><rect x="116" y="123" width="30" height="43" rx="5" className="art-cyan" /><rect x="159" y="112" width="30" height="54" rx="5" className="art-coral" />
      </Paper></g>
      <g className="art-detail"><path d="m266 155 25 28" className="art-bright-line" /><circle cx="245" cy="132" r="31" className="art-object" /><circle cx="245" cy="132" r="22" className="art-face" /><path d="M234 128h22m-22 9h15" className="art-rule" /></g>
    </>
    default: return null
  }
}
