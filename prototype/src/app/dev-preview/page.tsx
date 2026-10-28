import { notFound } from 'next/navigation'
export default async function ResponsivePreview({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  if(process.env.NODE_ENV!=='development'||process.env.LUMIO_RESPONSIVE_QA!=='true')notFound()
  const params=await searchParams
  const width=[390,768,1024,1280,1440].includes(Number(params.width))?Number(params.width):390
  const height=[720,800,844,900].includes(Number(params.height))?Number(params.height):844
  const page=params.page==='employers'?'/employers':'/'
  return <main style={{padding:12,minWidth:width+24}}>
    <p style={{margin:'0 0 8px',fontSize:14}}>Local responsive verification · {width} × {height}</p>
    <iframe title="Lumio responsive preview" src={page} width={width} height={height} style={{display:'block',border:0}} />
  </main>
}
