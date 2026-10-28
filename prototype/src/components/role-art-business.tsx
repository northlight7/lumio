import type { ReactNode } from 'react'
import { Check, Dot, Paper, PerspectiveBox, polygon, project } from './role-art-primitives'

/** Business scenes share the existing palette and use either a frontal diagram
 * or the shared level-camera projection for every face on a physical object. */
export function businessRoleScene(roleId: string): ReactNode | null {
  switch (roleId) {
    case 'customer-operations': return <>
      <Paper x={48} y={63} width={147} height={115}>
        <path d="M69 99h75m-75 17h102m-102 17h70" className="art-rule" />
        <rect x="69" y="148" width="77" height="13" rx="6" className="art-coral" />
      </Paper>
      <g className="art-entrance">
        <path d="M156 123V88a54 54 0 0 1 108 0v35" className="art-headset-depth" />
        <path d="M150 116V81a54 54 0 0 1 108 0v35" className="art-headset" />
        <rect x="139" y="94" width="25" height="47" rx="12" className="art-bright" />
        <rect x="248" y="94" width="25" height="47" rx="12" className="art-bright" />
        <path d="M260 139v14q0 20-26 20h-11" className="art-bright-line" />
        <rect x="208" y="167" width="26" height="12" rx="6" className="art-cyan" />
      </g><Check x={53} y={58} />
    </>
    case 'ux-designer': return <>
      <g className="art-entrance"><g transform="rotate(-8 112 115)">
        <rect x="60" y="32" width="106" height="164" rx="19" className="art-depth" />
        <rect x="54" y="25" width="106" height="164" rx="19" className="art-object" />
        <rect x="64" y="51" width="86" height="116" rx="10" className="art-pink" />
        <path d="M92 38h30" className="art-rule" />
        <rect x="75" y="65" width="64" height="39" rx="8" className="art-shade" />
        <path d="M75 119h51m-51 10h35" className="art-dark-line" />
        <rect x="75" y="143" width="53" height="13" rx="6" className="art-bright" />
      </g></g>
      <g className="art-detail"><g transform="rotate(7 218 125)">
        <Paper x={168} y={75} width={106} height={105}>
          <circle cx="190" cy="117" r="11" className="art-cyan" />
          <path d="M213 112h42m-42 12h29" className="art-rule" />
          <rect x="181" y="143" width="79" height="19" rx="8" className="art-bright" />
        </Paper>
      </g></g><path d="m243 38 11 27 6-10 11-4Z" className="art-yellow" />
    </>
    case 'sustainability-analyst': {
      const camera = { centerX: 120, groundY: 169, horizonY: -80, distance: 420, focal: 420 }
      const p = (x: number, z: number, h: number) => project(x, z, h, camera)
      const front = (x: number, h: number, width = 12, height = 16) => polygon([p(x,-35,h),p(x+width,-35,h),p(x+width,-35,h-height),p(x,-35,h-height)])
      const side = (z: number, h: number) => polygon([p(-44,z,h),p(-44,z+14,h),p(-44,z+14,h-16),p(-44,z,h-16)])
      return <>
        <g className="art-entrance">
          <PerspectiveBox width={88} depth={70} height={96} camera={camera}>
            {[78,51].flatMap(h => [-32,-6,20].map(x => <polygon key={`${h}-${x}`} points={front(x,h)} className="art-cyan" />))}
            {[78,51,25].flatMap(h => [-23,2].map(z => <polygon key={`${h}-${z}`} points={side(z,h)} className="art-face" />))}
            {[-34,22].map(x => <polygon key={x} points={front(x,25,12,14)} className="art-cyan" />)}
            <polygon points={front(-11,28,24,28)} className="art-shade" />
            <polygon points={front(-8,25,18,23)} className="art-object" />
            <polyline points={polygon([p(1,-35,25),p(1,-35,2)])} className="art-rule" />
            <polygon points={polygon([p(-13,-39,2),p(15,-39,2),p(15,-35,2),p(-13,-35,2)])} className="art-face" />
          </PerspectiveBox>
          <PerspectiveBox width={94} depth={76} height={4} elevation={96} camera={camera}>
            {[-22,3].map(x => <polygon key={x} points={polygon([p(x,-22,100),p(x+19,-22,100),p(x+19,19,100),p(x,19,100)])} className="art-shade" />)}
          </PerspectiveBox>
        </g>
        <g className="art-detail">
          <ellipse cx="209" cy="201" rx="17" ry="4" className="art-shadow" />
          <path d="M215 181C193 160 200 126 244 99c19 37 9 71-29 82Z" className="art-bright" />
          <path d="M209 200c8-29 20-56 33-82m-20 51-14-13m22-5 15-7" className="art-dark-line" />
        </g>
        <g transform="translate(230 47)"><circle r="24" className="art-yellow" /><path d="M-12 8h7V0h8v-9h9" className="art-dark-line" /></g>
      </>
    }
    case 'environmental-scientist': {
      const camera = { groundY: 145, horizonY: -85, distance: 420, focal: 420 }
      const p = (x: number, z: number, h = 12) => project(x,z,h,camera)
      return <>
        <g className="art-entrance"><PerspectiveBox width={172} depth={126} height={12} camera={camera} top="art-bright" left="art-depth" right="art-shade" />
          <polygon points={polygon([p(-73,63),p(-48,22),p(-7,24),p(-4,-15),p(28,-34),p(45,-63),p(66,-63),p(47,-20),p(17,-2),p(14,42),p(-29,39),p(-51,63)])} className="art-cyan" />
          <g transform={`translate(${p(-42,-21).join(' ')})`}><path d="M0 0v-21" className="art-dark-line" /><path d="m-14-16 14-34 14 34Z" className="art-shade" /></g>
          <g transform={`translate(${p(51,27).join(' ')})`}><path d="M0 0v-20" className="art-dark-line" /><path d="m-13-15 13-32 13 32Z" className="art-shade" /></g>
          <g transform={`translate(${p(47,-22).join(' ')})`}>
            <ellipse cx="0" cy="0" rx="11" ry="4" className="art-shade" />
            <path d="M0 0v-44" className="art-rule" />
            <rect x="-15" y="-98" width="30" height="54" rx="8" className="art-object" />
            <rect x="-9" y="-90" width="18" height="19" rx="3" className="art-cyan" /><Dot x={0} y={-61} r={4} />
          </g>
        </g>
      </>
    }
    case 'business-analyst': return <>
      <g className="art-entrance"><g transform="rotate(-6 142 113)">
        <Paper x={57} y={35} width={156} height={155}>
          <rect x="96" y="24" width="78" height="25" rx="8" className="art-coral" />
          {[84,113,142,171].map((y,i) => <g key={y}><rect x="76" y={y-8} width="17" height="17" rx="4" className={i<2?'art-bright':'art-face'} />{i<2 && <path d={`M80 ${y}l4 4 6-8`} className="art-dark-line" />}<path d={`M107 ${y}h${i===3?49:84}`} className="art-rule" /></g>)}
        </Paper>
      </g></g>
      <g className="art-detail"><g transform="translate(238 139) rotate(32)">
        <rect x="-10" y="-67" width="20" height="91" rx="2" className="art-yellow" />
        <rect x="-10" y="-67" width="20" height="13" rx="2" className="art-coral" />
        <path d="M-10 24 0 43 10 24Z" className="art-object" /><path d="M-4 36 0 43 4 36Z" className="art-shade" />
        <path d="M-2-48v66" className="art-dark-line" />
      </g></g>
    </>
    case 'digital-marketing-analyst': return <>
      <g className="art-entrance">
        <path d="M84 133h25l16 49h-22Z" className="art-coral" />
        <path d="m65 85 111-41v109L65 119Z" className="art-bright" />
        <path d="M176 44h15v109h-15Z" className="art-shade" />
        <rect x="49" y="86" width="29" height="33" rx="8" className="art-coral" />
        <path d="m212 70 34-16m-29 47h37m-42 25 31 15" className="art-pink-line" />
      </g>
      <g className="art-detail"><g transform="translate(233 173)"><circle r="29" className="art-cyan" /><path d="M-18 13h36" className="art-dark-line" /><rect x="-15" y="4" width="7" height="9" className="art-violet" /><rect x="-3" y="-3" width="7" height="16" className="art-coral" /><rect x="9" y="-13" width="7" height="26" className="art-bright" /></g></g>
    </>
    case 'product-manager': return <>
      <g className="art-entrance"><Paper x={43} y={57} width={231} height={127}>
        <path d="M64 142h187" className="art-rule" />
        <rect x="64" y="99" width="45" height="43" rx="7" className="art-violet" />
        <rect x="131" y="110" width="45" height="32" rx="7" className="art-cyan" />
        <rect x="198" y="89" width="45" height="53" rx="7" className="art-coral" />
        <Dot x={86} y={164} r={5} /><Dot x={153} y={164} r={5} /><Dot x={220} y={164} r={5} />
      </Paper></g>
      <g className="art-detail"><circle cx="230" cy="43" r="27" className="art-bright" /><circle cx="230" cy="43" r="17" className="art-shade" /><circle cx="230" cy="43" r="7" className="art-bright" /><path d="m251 22-21 21" className="art-dark-line" /></g>
    </>
    case 'supply-chain-planner': {
      const camera = { groundY: 167, horizonY: -70, distance: 450, focal: 450 }
      const p = (x: number,z: number,h: number) => project(x,z,h,camera)
      return <>
        <g className="art-entrance">
          <PerspectiveBox x={-36} z={35} width={68} depth={68} height={81} camera={camera} top="art-yellow">
            <polyline points={polygon([p(-36,69,81),p(-36,1,81),p(-36,1,53)])} className="art-dark-line" />
          </PerspectiveBox>
          <PerspectiveBox x={63} z={-42} width={57} depth={57} height={47} camera={camera} top="art-coral" />
        </g>
        <g className="art-detail"><path d="M174 49h55v37m-8-9 8 9 8-9" className="art-bright-line" /><Dot x={174} y={49} color="art-cyan" r={8} /></g>
      </>
    }
    case 'operations-planner': return <>
      <g className="art-entrance"><Paper x={44} y={45} width={229} height={141}>
        <path d="M64 88h190m-190 40h190m-190 40h190M101 75v98m47-98v98m47-98v98m37-98v98" className="art-rule" />
        <path d="m79 96 46 51 61-43 48 47" className="art-bright-line" />
        <Dot x={79} y={96} color="art-violet" r={7} /><Dot x={125} y={147} color="art-coral" r={7} /><Dot x={186} y={104} color="art-yellow" r={7} />
      </Paper></g>
      <g className="art-detail"><path d="M213 112a21 21 0 1 1 42 0q0 18-21 39-21-21-21-39Z" className="art-coral" /><circle cx="234" cy="112" r="7" className="art-object" /></g>
      <circle cx="74" cy="175" r="24" className="art-violet" /><path d="M74 162v13l10 7" className="art-dark-line" />
    </>
    case 'financial-analyst': return <>
      <g className="art-entrance"><g transform="rotate(-7 118 112)">
        <rect x="59" y="32" width="112" height="167" rx="14" className="art-depth" /><rect x="53" y="25" width="112" height="167" rx="14" className="art-object" />
        <rect x="67" y="41" width="84" height="35" rx="6" className="art-yellow" /><path d="M83 59h51" className="art-dark-line" />
        {[0,1,2].flatMap(row => [0,1,2].map(col => <rect key={`${row}-${col}`} x={69+col*29} y={90+row*28} width="20" height="18" rx="4" className={col===2?'art-cyan':'art-face'} />))}
      </g></g>
      <g className="art-detail">
        {[174,164,154].map((y,i) => <g key={y}><path d={`M190 ${y}v10a37 13 0 0 0 74 0v-10`} className="art-shade" /><ellipse cx="227" cy={y} rx="37" ry="13" className={i===1?'art-coral':'art-yellow'} /></g>)}
        <ellipse cx="227" cy="154" rx="25" ry="8" fill="none" stroke="var(--accent-ink)" strokeWidth="2" />
        <path d="m219 154 8-4 8 4-8 4Z" className="art-dark-line" />
      </g>
    </>
    case 'project-coordinator': return <>
      <g className="art-entrance"><Paper x={44} y={39} width={228} height={146}>
        <path d="M82 26v28m149-28v28" className="art-bright-line" />
        <path d="M63 82h189m-150 0v85m49-85v85m49-85v85" className="art-rule" />
        <rect x="70" y="95" width="64" height="18" rx="5" className="art-coral" />
        <rect x="120" y="123" width="69" height="18" rx="5" className="art-cyan" />
        <rect x="171" y="151" width="65" height="18" rx="5" className="art-violet" />
      </Paper></g><g className="art-detail"><Check x={255} y={185} /></g>
    </>
    default: return null
  }
}
