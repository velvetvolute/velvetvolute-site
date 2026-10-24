import cv2,numpy as np,json,re,sys
R='/tmp/claude-0/-home-claude/d7b6e531-1b3d-5209-a777-8ecc6d5dd647/scratchpad/site-repo/'
src=open(R+'tools/collection-images.py').read()
BOX=eval(re.search(r'BOX = (\{.*?\})\n',src,re.S).group(1))
h=open(R+'index.html').read(); IMG=json.loads(re.search(r"const IMG=(\{.*?\});\n",h).group(1))
only=sys.argv[1:]
for k,(l,t,r,b) in BOX.items():
    if only and k not in only: continue
    p=R+re.sub(r'\.w1080\.jpg$','.jpg',IMG[k]); im=cv2.imread(p); N=1000
    sm=cv2.resize(im,(N,N),interpolation=cv2.INTER_AREA)
    m=np.full((N,N),cv2.GC_BGD,np.uint8)
    x0,y0,x1,y1=int((l-.012)*N),int((t-.012)*N),int((r+.012)*N),int(min(b+.006,1)*N)
    x0=max(0,x0); m[y0:y1,x0:x1]=cv2.GC_PR_BGD
    bx0,by0,bx1,by1=int(l*N),int(t*N),int(r*N),int(b*N)
    m[by0:by1,bx0:bx1]=cv2.GC_PR_FGD
    bw,bh=bx1-bx0,by1-by0
    m[by0+int(bh*.45):by1-int(bh*.06),bx0+int(bw*.12):bx1-int(bw*.12)]=cv2.GC_FGD
    m[by0+int(bh*.03):by0+int(bh*.2),bx0+int(bw*.45):bx1-int(bw*.45)]=cv2.GC_FGD
    bg=np.zeros((1,65));fg=np.zeros((1,65))
    cv2.grabCut(sm,m,None,bg,fg,6,cv2.GC_INIT_WITH_MASK)
    mk=((m==1)|(m==3)).astype(np.uint8)*255
    mk=cv2.morphologyEx(mk,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    # drop flat patches of the photo's own wall that the cutout grabbed: compare to the wall painted in behind the bottle
    small=cv2.resize(sm,(250,250),interpolation=cv2.INTER_AREA); hm=cv2.resize(cv2.dilate(mk,np.ones((15,15),np.uint8)),(250,250))
    wall=cv2.resize(cv2.inpaint(small,hm,9,cv2.INPAINT_TELEA),(N,N),interpolation=cv2.INTER_CUBIC)
    L1=cv2.cvtColor(sm,cv2.COLOR_BGR2LAB).astype(np.float32); L2=cv2.cvtColor(wall,cv2.COLOR_BGR2LAB).astype(np.float32)
    d=np.sqrt(((L1-L2)**2).sum(2)); d=cv2.GaussianBlur(d,(0,0),2)
    flat=((d<15)&(mk>0)).astype(np.uint8); flat[int(by0+bh*.97):]=0
    edge=cv2.dilate((mk==0).astype(np.uint8),np.ones((5,5),np.uint8))
    nf,lf,_,_=cv2.connectedComponentsWithStats(flat)
    touch=set(np.unique(lf[(edge>0)&(flat>0)]))-{0}
    mk[np.isin(lf,list(touch))]=0
    mk=cv2.morphologyEx(mk,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    seed=np.zeros_like(mk); seed[by0+int(bh*.45):by1-int(bh*.06),bx0+int(bw*.12):bx1-int(bw*.12)]=1; seed[by0+int(bh*.03):by0+int(bh*.2),bx0+int(bw*.45):bx1-int(bw*.45)]=1
    if k in ('u-coffee.jpg','u-jazz.jpg'):
        mk[by0:by0+int(bh*.2),bx0+int(bw*.36):bx1-int(bw*.36)]=255
    n,lab,st,_=cv2.connectedComponentsWithStats(mk); keep=set(np.unique(lab[(seed>0)&(mk>0)]))-{0}
    mk=np.isin(lab,list(keep)).astype(np.uint8)*255
    pad=cv2.copyMakeBorder(mk,1,1,1,1,cv2.BORDER_CONSTANT,0); ff=pad.copy(); fl=np.zeros((N+4,N+4),np.uint8); cv2.floodFill(ff,fl,(0,0),255); mk=(pad|cv2.bitwise_not(ff))[1:-1,1:-1]
    mk=cv2.morphologyEx(mk,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
    clip=np.zeros_like(mk); clip[:int((b+.003)*N),max(0,int((l-.004)*N)):int((r+.004)*N)]=255
    NISH={'u-kredo','u-tempfluo','u-papilefiko','u-deziro','u-tero','u-fyf','u-fyfx','u-hswx','u-wulong','u-wulongx','u-suede','u-nefs'}
    if k[:-4] in NISH:
        clip[:by0+int(bh*.44)]=0; clip[:by0+int(bh*.44),bx0+int(bw*.26):bx1-int(bw*.06)]=255
    if k[:-4] in {'u-coral','u-green','u-yellow','u-purple'}:
        clip[:by0+int(bh*.26)]=0; clip[:by0+int(bh*.26),bx0+int(bw*.30):bx1-int(bw*.30)]=255
    mk=mk&clip
    cv2.imwrite('m_'+k.replace('.jpg','.png'),mk)
    viz=sm.copy(); viz[mk==0]=(viz[mk==0]*0.15+np.array([40,160,40])*0.85).astype(np.uint8)
    cv2.imwrite('v_'+k,cv2.resize(viz[max(0,y0-20):y1+10,max(0,x0-20):x1+20],(220,300)))
