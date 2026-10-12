# 커리어 트로피 아이콘 만들기(1회성): 사용자가 AI로 뽑은 3×2 시트(분홍 배경, A~H.png)를 칸별로 잘라 배경 제거·바닥 맞춤·128px → img/career/tro/
# python3 scripts/build_career_trophies.py (시트가 있는 폴더에서). 시트 원본은 용량 때문에 저장소에 없다. 이름 → 파일 연결은 index.html CR_TRO_IMG
import os; from PIL import Image; import numpy as np
from scipy import ndimage
OUT='/home/user/arsenal/arsenal-dashboard/public/img/career/tro'; os.makedirs(OUT,exist_ok=True)
NAMES={'A':['worldcup','euro','copa','asiancup','goldcup','afcon'],
 'B':['ucl','cup','ballon','best','goldenball','goldenshoe'],
 'C':['topscorer','poty',None,'uclpoty',None,None],
 'D':['motm','goal','worldbest11','best11','clubpoty','natpoty'],
 'E':['league_ENG','league_ESP','league_GER','league_ITA','league_FRA','league_POR'],
 'F':['league_NED','league_BEL','league_BRA',None,None,'league_KOR'],
 'G':['league_JPN','league_USA','league_NGA',None,None,None],
 'H':['young','assist','league_ARG','league_NOR','youth','goldenboy']}
def cut(src):
    a=np.array(Image.open(src).convert('RGB')).astype(float); H,W,_=a.shape
    r,g,b=a[...,0],a[...,1],a[...,2]; alpha=1-np.clip(((np.minimum(r,b)-g)-60)/80,0,1)
    key=np.array([240,0,240.]); al=np.clip(alpha,1e-3,1)[...,None]; rgb=np.clip((a-key*(1-al))/al,0,255); rgb[alpha<0.02]=0
    return np.dstack([rgb,alpha*255]),H,W
for k,names in NAMES.items():
    im,H,W=cut(k+'.png')
    for idx,n in enumerate(names):
        if not n: continue
        j,i=divmod(idx,3); cell=im[j*H//2:(j+1)*H//2, i*W//3:(i+1)*W//3]
        m=cell[...,3]>40
        lab,nl=ndimage.label(ndimage.binary_closing(m,iterations=3)); sizes=ndimage.sum(m,lab,range(1,nl+1))
        keep=np.isin(lab,[i+1 for i,v in enumerate(sizes) if v>=sizes.max()*0.08])   # 큰 덩어리만(옆 칸에서 넘어온 조각 제거)
        cell=cell.copy(); cell[~keep]=0; m=cell[...,3]>40; ys,xs=np.where(m)
        crop=cell[ys.min():ys.max()+1, xs.min():xs.max()+1]; h,w=crop.shape[:2]; S=max(h,w)
        pad=np.zeros((S,S,4)); pad[S-h:,(S-w)//2:(S-w)//2+w]=crop
        Image.fromarray(pad.astype(np.uint8),'RGBA').resize((128,128),Image.BOX).save(os.path.join(OUT,n+'.png'),optimize=True)
print(len(os.listdir(OUT)))
