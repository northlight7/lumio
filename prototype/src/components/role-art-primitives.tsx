import type { ReactNode } from 'react'

export function Paper({ x = 60, y = 45, width = 190, height = 126, children }: { x?: number; y?: number; width?: number; height?: number; children?: ReactNode }) {
  return <g><rect x={x + 8} y={y + 10} width={width} height={height} rx="14" className="art-depth" /><rect x={x} y={y} width={width} height={height} rx="14" className="art-object" /><path d={`M${x + 18} ${y + 20}h${width - 36}`} className="art-rule" />{children}</g>
}
export function Dot({ x, y, color = 'art-bright', r = 5 }: { x: number; y: number; color?: string; r?: number }) {
  return <circle cx={x} cy={y} r={r} className={color} />
}
export function Check({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}><circle r="15" className="art-bright" /><path d="m-6 0 4 4 8-9" className="art-dark-line" /></g>
}

export type Perspective = { centerX?: number; groundY?: number; horizonY?: number; distance?: number; focal?: number }
export type Point = [number, number]

// A level camera keeps vertical edges vertical. The two horizontal axes
// converge to the same left/right vanishing points for every face and detail.
export function project(x: number, z: number, height: number, camera: Perspective = {}): Point {
  const { centerX = 160, groundY = 194, horizonY = 54, distance = 360, focal = 360 } = camera
  const diagonal = Math.SQRT1_2
  const depth = distance + (x + z) * diagonal
  return [centerX + focal * (x - z) * diagonal / depth, horizonY + ((groundY - horizonY) * distance - focal * height) / depth]
}
export function polygon(points: Point[]): string {
  return points.map(([x, y]) => `${Number(x.toFixed(3))},${Number(y.toFixed(3))}`).join(' ')
}
export function PerspectiveBox({ x = 0, z = 0, width, depth, height, elevation = 0, camera = {}, top = 'art-bright', left = 'art-shade', right = 'art-face', children }: { x?: number; z?: number; width: number; depth: number; height: number; elevation?: number; camera?: Perspective; top?: string; left?: string; right?: string; children?: ReactNode }) {
  const p = (a: number, b: number, h: number) => project(a, b, h, camera)
  const x0 = x - width / 2, x1 = x + width / 2, z0 = z - depth / 2, z1 = z + depth / 2
  const bottom = elevation, roof = elevation + height
  return <g>
    <polygon points={polygon([p(x0,z0,roof),p(x0,z1,roof),p(x0,z1,bottom),p(x0,z0,bottom)])} className={left} />
    <polygon points={polygon([p(x0,z0,roof),p(x1,z0,roof),p(x1,z0,bottom),p(x0,z0,bottom)])} className={right} />
    <polygon points={polygon([p(x0,z0,roof),p(x1,z0,roof),p(x1,z1,roof),p(x0,z1,roof)])} className={top} />
    {children}
  </g>
}
