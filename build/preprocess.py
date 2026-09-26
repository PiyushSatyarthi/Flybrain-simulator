"""Build the browser data package for FlyLab from the FlyWire FAFB v783 connectome.

Inputs : flybrain/data/{neurons,connections,coordinates}.csv.gz  (FlyWire Codex, v783)
         flywire_annotations Supplemental_file1_neuron_annotations.tsv (Schlegel et al. 2024)
Outputs: app/brain.bin.gz (CSR connectome + per-neuron metadata), app/meta.json
Nothing behavioural is decided here: we only store wiring, signs, identities,
anatomical positions and the retinotopic receptive-field centre of each optic neuron.
"""
import pandas as pd, numpy as np, json, gzip, struct, collections, re, argparse, os, base64

_here = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(_here)
ap = argparse.ArgumentParser(description='Build the FlyLab connectome package')
ap.add_argument('--codex', default=os.path.join(_root, 'data', 'raw', 'codex'), help='folder with neurons.csv.gz, connections.csv.gz, coordinates.csv.gz')
ap.add_argument('--annotations', default=os.path.join(_root, 'data', 'raw', 'Supplemental_file1_neuron_annotations.tsv'))
ap.add_argument('--out', default=os.path.join(_root, 'app'))
args = ap.parse_args()
D = args.codex.rstrip('/') + '/'
A = args.annotations
OUT = args.out.rstrip('/') + '/'

neu=pd.read_csv(D+'neurons.csv.gz')
ann=pd.read_csv(A,sep='\t',low_memory=False).drop_duplicates('root_id')
con=pd.read_csv(D+'connections.csv.gz')
coo=pd.read_csv(D+'coordinates.csv.gz').drop_duplicates('root_id')

ids=neu.root_id.values; N=len(ids)
idx=pd.Series(np.arange(N),index=ids)
ann=ann.set_index('root_id').reindex(ids)
print('neurons',N,'annotated',ann.super_class.notna().sum())

# ---- neurotransmitter sign per PRESYNAPTIC NEURON (as in Shiu et al. 2024) ----
# priority: literature-verified transmitter (known_nt) > neuron-level prediction (Eckstein et al. 2024)
NTS=['acetylcholine','gaba','glutamate','histamine','dopamine','serotonin','octopamine','tyramine']
def known(s):
    if not isinstance(s,str): return None
    for tok in re.split(r'[;,]',s):
        tok=tok.strip().lower()
        if tok in NTS: return tok
    return None
abbrev={'ACH':'acetylcholine','GABA':'gaba','GLUT':'glutamate','DA':'dopamine','SER':'serotonin','OCT':'octopamine'}
kn=ann.known_nt.map(known)
pred=neu.set_index('root_id').reindex(ids).nt_type.map(abbrev)
top=ann.top_nt.str.lower()
nt_final=kn.fillna(pd.Series(pred.values,index=kn.index)).fillna(top).fillna('unknown')
print(nt_final.value_counts().to_dict())
SIGN={'acetylcholine':1,'gaba':-1,'glutamate':-1,'histamine':-1}
nsign=nt_final.map(lambda t:SIGN.get(t,1)).values.astype(np.int8)
con['pre']=idx.reindex(con.pre_root_id).values
con['post']=idx.reindex(con.post_root_id).values
con=con.dropna(subset=['pre','post'])
con['pre']=con.pre.astype(np.int64); con['post']=con.post.astype(np.int64)
con['w']=con.syn_count*nsign[con.pre.values]

# primary neuropil per neuron (most synapses, input+output)
nps=sorted(con.neuropil.unique())
npi={p:i for i,p in enumerate(nps)}
con['np']=con.neuropil.map(npi)
K=len(nps)
# region membership = where a neuron RECEIVES its input (its dendrites compute there);
# neurons without inputs in the brain (sensory afferents) fall back to where they output.
cin=np.bincount(con.post.values*K+con.np.values,con.syn_count.values,N*K).reshape(N,K)
cout=np.bincount(con.pre.values*K+con.np.values,con.syn_count.values,N*K).reshape(N,K)
primary=cin.argmax(1).astype(np.uint8)
noin=cin.sum(1)==0
primary[noin]=cout[noin].argmax(1)
primary[noin&(cout.sum(1)==0)]=npi.get('UNASGD',0)

# aggregate to neuron pairs
edges=con.groupby(['pre','post']).w.sum().reset_index()
edges=edges[edges.w!=0].sort_values(['pre','post'])
E=len(edges); print('edges',E)
rowptr=np.zeros(N+1,np.uint32)
np.add.at(rowptr,edges.pre.values+1,1); rowptr=np.cumsum(rowptr).astype(np.uint32)
post=edges.post.values.astype(np.uint32)
w=np.clip(edges.w.values,-32767,32767).astype(np.int16)

# ---- identities ----
def cat(series):
    s=series.fillna('').astype(str)
    names=sorted(set(s)); m={k:i for i,k in enumerate(names)}
    return names, s.map(m).values
side_names=['left','right','center','']
side=ann.side.fillna('').map(lambda s: side_names.index(s) if s in side_names else 3).values.astype(np.uint8)
sc_names,sc=cat(ann.super_class)
cl_names,cl=cat(ann.cell_class)
sub_names,sub=cat(ann.cell_sub_class)
ctype=ann.cell_type.fillna(ann.hemibrain_type)
ctype=ctype.where(ctype.notna(), None)
# fallback label so every neuron is searchable
fallback=ann.cell_sub_class.fillna(ann.cell_class).fillna(ann.super_class).fillna('unknown')
ctype=ctype.fillna(fallback.map(lambda s:'('+str(s)+')'))
ty_names,ty=cat(ctype)
nt=nt_final.values
nt_names,ntc=cat(pd.Series(nt))

# positions (nm) -> int16 micrometre-ish grid
p=coo.set_index('root_id').reindex(ids).position.fillna('[0 0 0]')
P=np.array([[float(v) for v in re.findall(r'-?\d+',s)] for s in p])
# fill missing with annotation pos (voxels 4,4,40 nm)
miss=(P==0).all(1)
av=ann[['pos_x','pos_y','pos_z']].values*np.array([4,4,40])
P[miss]=np.nan_to_num(av[miss])
Pu=(P/1000.0)  # micrometres
Pu16=np.clip(np.round(Pu),0,32767).astype(np.int16)

# ---- retinotopy: each optic-lobe neuron inherits a receptive-field centre from photoreceptors ----
# Photoreceptor (R1-6/R7/R8) lamina/medulla positions -> visual angles (rank-normalised):
# anterior(z small)=frontal, dorsal(y small)=up. az>0 = fly's right.
az=np.full(N,np.nan); el=np.full(N,np.nan)
isR=ctype.isin(['R1-6','R7','R8']).values
for s,sgn in ((0,-1),(1,1)):
    m=isR&(side==s)
    zz=pd.Series(P[m,2]).rank(pct=True).values; yy=pd.Series(P[m,1]).rank(pct=True).values
    az[m]=sgn*(-15+zz*175)      # -15 (frontal, binocular) .. 160 deg (rear)
    el[m]=70-yy*140             # +70 up .. -70 down
optic=ann.super_class.isin(['optic','visual_projection','visual_centrifugal','sensory']).values
E_pre=edges.pre.values; E_post=edges.post.values; E_w=np.abs(edges.w.values).astype(float)
sel=optic[E_pre]&optic[E_post]&(side[E_pre]==side[E_post])&(E_w>0)
ep,eq,ew=E_pre[sel],E_post[sel],E_w[sel]
for it in range(8):
    have=~np.isnan(az[ep])
    s_w=np.bincount(eq[have],ew[have],N)
    # average as unit vectors to respect geometry
    ax=np.bincount(eq[have],ew[have]*az[ep][have],N); ay=np.bincount(eq[have],ew[have]*el[ep][have],N)
    new=(s_w>0)&np.isnan(az)&~isR
    az[new]=ax[new]/s_w[new]; el[new]=ay[new]/s_w[new]
    print('retinotopy iter',it,'assigned',int((~np.isnan(az)).sum()))
az16=np.where(np.isnan(az),-32768,np.round(az*10)).astype(np.int16)
el16=np.where(np.isnan(el),-32768,np.round(el*10)).astype(np.int16)

# ---- write binary ----
buf=bytearray()
buf+=struct.pack('<4sII',b'FLY1',N,E)
buf+=rowptr.tobytes()+post.tobytes()+w.tobytes()
buf+=side.tobytes()+sc.astype(np.uint8).tobytes()+cl.astype(np.uint8).tobytes()+sub.astype(np.uint8).tobytes()
buf+=ntc.astype(np.uint8).tobytes()+primary.tobytes()
buf+=ty.astype(np.uint16).tobytes()
buf+=Pu16.tobytes()          # N*3 int16 interleaved x,y,z (um)
buf+=az16.tobytes()+el16.tobytes()
with gzip.open(OUT+'brain.bin.gz','wb',compresslevel=9) as f: f.write(bytes(buf))
# base64 copy for hosts that only serve text files (e.g. claude.ai artifacts)
with open(OUT+'brain.bin.gz','rb') as f, open(OUT+'brain.b64.txt','w') as g: g.write(base64.b64encode(f.read()).decode())
print('raw MB',len(buf)/1e6)

meta=dict(N=int(N),E=int(E),source='FlyWire FAFB v783 (Dorkenwald et al. 2024; Schlegel et al. 2024)',
  sides=side_names,superclasses=sc_names,classes=cl_names,subclasses=sub_names,
  types=ty_names,nts=nt_names,neuropils=nps,
  root_ids=[str(x) for x in ids])
json.dump(meta,open(OUT+'meta.json','w'))
print('types',len(ty_names),'sc',len(sc_names),'cl',len(cl_names),'sub',len(sub_names),'nt',nt_names)
# quick check of LC retinotopy
for t in ['LPLC2','LC4','LC11','HSE']:
    m=(ctype==t).values
    for s in (0,1):
        mm=m&(side==s); print(t,side_names[s],np.nanmin(az[mm]).round(),np.nanmean(az[mm]).round(),np.nanmax(az[mm]).round(),'el',np.nanmin(el[mm]).round(),np.nanmax(el[mm]).round())
