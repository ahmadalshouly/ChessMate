"""
Stand-in game server for screenshots of the Watch screens: serves a static web
build and answers /api/watch/* with sample data (invented event, players and
streamers). Usage: python3 mock_server.py <dist-dir>  (listens on 127.0.0.1:8099)
"""
import json, os, re, sys, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

DIST = sys.argv[1]
H = 3600_000
D = 24 * H
def now(): return int(time.time() * 1000)

START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
OPENINGS = [
  (['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6'], 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4'),
  (['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','a7a6'], 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6'),
  (['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','f8e7'], 'rnbqk2r/ppp1bppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR w KQkq - 3 5'),
  (['e2e4','c7c6','d2d4','d7d5','e4e5','c8f5'], 'rn1qkbnr/pp2pppp/2p5/3pPb2/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 1 4'),
  (['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4'], 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4'),
  (['e2e4','e7e6','d2d4','d7d5','b1c3','f8b4','e4e5'], 'rnbqk1nr/ppp2ppp/4p3/3pP3/1b1P4/2N5/PPP2PPP/R1BQKBNR b KQkq - 0 4'),
]
PLAYERS = [
  ('p1','Lindqvist, Erik','GM',2712,'SE'),('p2','Moreau, Camille','GM',2694,'FR'),('p3','Okafor, Daniel','GM',2681,'NG'),('p4','Haddad, Lina','IM',2598,'LB'),
  ('p5','Brandt, Jonas','GM',2655,'DE'),('p6','Sato, Hiro','GM',2667,'JP'),('p7','Novak, Petra','WGM',2431,'CZ'),('p8','Alvarez, Mateo','IM',2552,'AR'),
  ('p9','Kowalski, Anna','IM',2519,'PL'),('p10','Rossi, Luca','FM',2468,'IT'),('p11','Chen, Mei','WGM',2447,'CN'),('p12','Petrov, Ivan','GM',2633,'BG'),
]
P = {p[0]: p for p in PLAYERS}
def gp(pid): n=P[pid]; return {'name':n[1],'title':n[2],'rating':n[3],'federation':n[4],'playerId':pid}

def game(gid, rid, board, w, b, result, op, clocks=True):
    moves, fen = OPENINGS[op]
    ply = len(moves)
    status = 'finished' if result != '*' else ('live' if ply else 'notStarted')
    return {'id':gid,'roundId':rid,'board':board,'white':gp(w),'black':gp(b),'result':result,'status':status,'fen':fen,'lastMove':moves[-1],'ply':ply,
            'whiteClockMs':(4_980_000 - board*61_000) if clocks else None,'blackClockMs':(5_210_000 - board*47_000) if clocks else None,'clockAt':now()-12_000,
            'ending':{'1-0':'resign','0-1':'timeout','1/2-1/2':'agreement'}.get(result),
            '_moves':moves}

PAIRS3 = [('p1','p6'),('p2','p5'),('p3','p12'),('p4','p8'),('p9','p7'),('p11','p10')]
def rounds_berlin():
    t0 = now() - 2*D
    r = []
    res = [['1-0','1/2-1/2','0-1','1/2-1/2','1-0','1/2-1/2'],['1/2-1/2','1-0','1/2-1/2','0-1','1/2-1/2','1-0']]
    pairs = [[('p1','p4'),('p2','p3'),('p5','p6'),('p7','p8'),('p9','p10'),('p11','p12')],[('p3','p1'),('p6','p2'),('p8','p5'),('p12','p9'),('p10','p7'),('p4','p11')]]
    for i in range(2):
        rid=f'r{i+1}'
        r.append({'id':rid,'number':i+1,'name':f'Round {i+1}','startsAt':t0+i*D,'status':'finished','games':[game(f'g{i+1}{j}',rid,j+1,w,b,res[i][j],(i+j)%6) for j,(w,b) in enumerate(pairs[i])]})
    live = [game(f'g3{j}','r3',j+1,w,b,'*' if j<4 else ('1-0' if j==4 else '1/2-1/2'),j%6) for j,(w,b) in enumerate(PAIRS3)]
    r.append({'id':'r3','number':3,'name':'Round 3','startsAt':now()-2*H,'status':'live','games':live})
    for i in range(3,7):
        r.append({'id':f'r{i+1}','number':i+1,'name':f'Round {i+1}','startsAt':t0+i*D,'status':'upcoming','games':[]})
    return r

def standings(rounds):
    pts = {p[0]:0.0 for p in PLAYERS}; games={p[0]:[0,0,0] for p in PLAYERS}; opp={p[0]:[] for p in PLAYERS}
    for r in rounds:
        for g in r['games']:
            if g['result']=='*': continue
            w=g['white']['playerId']; b=g['black']['playerId']; opp[w].append(b); opp[b].append(w)
            if g['result']=='1-0': pts[w]+=1; games[w][0]+=1; games[b][2]+=1
            elif g['result']=='0-1': pts[b]+=1; games[b][0]+=1; games[w][2]+=1
            else: pts[w]+=.5; pts[b]+=.5; games[w][1]+=1; games[b][1]+=1
    rows=[]
    for pid,(_,name,title,rating,fed) in P.items():
        bh=sum(pts[o] for o in opp[pid]); n=sum(games[pid])
        avg=sum(P[o][3] for o in opp[pid])/len(opp[pid]) if opp[pid] else None
        perf=round(avg+400*(games[pid][0]-games[pid][2])/n) if n else None
        rows.append({'playerId':pid,'name':name,'title':title,'rating':rating,'federation':fed,'points':pts[pid],'games':n,'wins':games[pid][0],'draws':games[pid][1],'losses':games[pid][2],'buchholz':bh,'performance':perf})
    rows.sort(key=lambda r:(-r['points'],-r['buchholz'],-r['wins'],-r['rating']))
    for i,r in enumerate(rows): r['rank']=i+1
    return rows

def strip(rounds):
    return [{**r,'games':[{k:v for k,v in g.items() if k!='_moves'} for g in r['games']]} for r in rounds]

def berlin():
    rounds = rounds_berlin()
    return {'id':'berlin','name':'Berlin Spring Open 2026','shortDescription':'7-round Swiss · 12 grandmasters and masters · DGT live boards','location':'Berlin, Germany',
      'startsAt':now()-2*D,'endsAt':now()+4*D,'format':'swiss','timeControl':'90+30','status':'live','featured':True,'published':True,'hidden':False,'source':'chessmate','sourceUrl':None,
      'logoPath':None,'playerCount':12,'roundCount':7,'liveGames':4,'currentRound':{'id':'r3','number':3,'name':'Round 3'},
      'description':'The Berlin Spring Open brings twelve strong players to the city for seven rounds of classical chess. Games start at 15:00 CET every day, with live commentary on our partner streams.',
      'website':'https://example.org/berlin-open','coverPath':None,
      'links':[{'label':'Pairings','url':'https://example.org/pairings'},{'label':'Live commentary','url':'https://twitch.tv/example'},{'label':'','url':'https://example.org/photos'}],
      'rounds':strip(rounds),
      'players':[{'id':p[0],'name':p[1],'title':p[2],'rating':p[3],'federation':p[4],'fideId':str(1000000+i*137),'userId':None,'username':'lindqvist' if p[0]=='p1' else None} for i,p in enumerate(sorted(PLAYERS,key=lambda p:-p[3]))],
      'standings':standings(rounds),
      'news':[{'id':'n2','title':'Round 3 under way','body':'Lindqvist and Sato have started with the Ruy Lopez on board one. Moreau leads after two rounds with a perfect start in the Najdorf.','author':{'id':'u1','username':'berlinopen','displayName':'Berlin Open'},'createdAt':now()-90*60_000,'imagePath':None,'links':[{'label':'Round 3 pairings','url':'https://example.org/r3'}]},
               {'id':'n1','title':'Welcome to the Berlin Spring Open','body':'Pairings for round 1 are online. All games are broadcast live on ChessMate.','author':{'id':'u1','username':'berlinopen','displayName':'Berlin Open'},'createdAt':now()-2*D,'imagePath':None,'links':[]}],
      'canManage':False}, rounds

SUMMARY_KEYS = ['id','name','shortDescription','location','startsAt','endsAt','format','timeControl','status','featured','published','hidden','source','sourceUrl','logoPath','coverPath','playerCount','roundCount','liveGames','currentRound']
def summ(e): return {k:e[k] for k in SUMMARY_KEYS}
def others():
    return [
      {'id':'gtf','name':'Grand Tour Finals','shortDescription':'8-player double round robin','location':'Bucharest','startsAt':now()-3*D,'endsAt':now()+5*D,'format':'roundRobin','timeControl':'120+30','status':'live','featured':False,'published':True,'hidden':False,'source':'lichess','sourceUrl':'https://lichess.org/broadcast','logoPath':None,'playerCount':8,'roundCount':14,'liveGames':4,'currentRound':{'id':'x','number':6,'name':'Round 6'}},
      {'id':'rhine','name':'Rhine Rapid Cup','shortDescription':'Rapid Swiss for clubs along the Rhine','location':'Cologne, Germany','startsAt':now()+6*D,'endsAt':now()+7*D,'format':'swiss','timeControl':'15+10','status':'upcoming','featured':False,'published':True,'hidden':False,'source':'chessmate','sourceUrl':None,'logoPath':None,'playerCount':64,'roundCount':9,'liveGames':0,'currentRound':{'id':'y','number':1,'name':'Round 1'}},
      {'id':'nordic','name':'Nordic Masters 2026','shortDescription':'10-player round robin','location':'Oslo, Norway','startsAt':now()-20*D,'endsAt':now()-12*D,'format':'roundRobin','timeControl':'90+30','status':'finished','featured':False,'published':True,'hidden':False,'source':'chessmate','sourceUrl':None,'logoPath':None,'playerCount':10,'roundCount':9,'liveGames':0,'currentRound':{'id':'z','number':9,'name':'Round 9'}},
    ]

def streamers():
    return [
      {'userId':'s1','username':'queenside_qing','displayName':'Qing Hart','title':'IM','country':'CA','headline':'Daily blitz and opening ideas','channels':[{'platform':'twitch','url':'https://twitch.tv/example'},{'platform':'youtube','url':'https://youtube.com/@example'}],'live':{'since':now()-40*60_000,'title':'Berlin Open live commentary · Round 3','url':'https://twitch.tv/example','platform':'twitch','viewers':1284,'thumbnail':None,'embed':None,'auto':True}},
      {'userId':'s2','username':'endgame_ella','displayName':'Ella Marsh','title':'WFM','country':'GB','headline':'Endgame lessons every Sunday','channels':[{'platform':'youtube','url':'https://youtube.com/@example2'}],'live':None},
      {'userId':'s3','username':'blitzbaron','displayName':'Tomás Reyes','title':None,'country':'MX','headline':'Speedruns from 800 to 2000','channels':[{'platform':'kick','url':'https://kick.com/example'},{'platform':'twitch','url':'https://twitch.tv/example3'}],'live':None},
    ]

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send_json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code); self.send_header('content-type','application/json'); self.send_header('access-control-allow-origin','*'); self.send_header('content-length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_OPTIONS(self):
        self.send_response(204); self.send_header('access-control-allow-origin','*'); self.send_header('access-control-allow-headers','authorization, content-type'); self.send_header('access-control-allow-methods','GET, POST, DELETE, OPTIONS'); self.end_headers()
    def do_GET(self):
        path = self.path.split('?')[0]
        if path.startswith('/api/'):
            e, rounds = berlin()
            if path == '/api/puzzles/me': return self.send_json(200, {'rating':1642,'rd':60,'provisional':False,'attempts':318,'solved':247,'bestStreak':23,'bestRush':31})
            if path == '/api/puzzles/daily': return self.send_json(200, {'day':'2026-11-22','attempted':False,'puzzle':{'id':'0000D','fen':'5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27','moves':['d3d6','f8d8','d6d8','f6d8'],'rating':1640,'themes':['advantage','endgame','short'],'plays':14767}})
            if path == '/api/puzzles/themes': return self.send_json(200, {'total':20700,'counts':{'mateIn1':2210,'mateIn2':2456,'mateIn3':690,'fork':2901,'pin':1520,'skewer':610,'discoveredAttack':1180,'sacrifice':2003,'hangingPiece':980,'endgame':6020,'middlegame':10230,'opening':1780,'backRankMate':720,'deflection':940,'attraction':530,'defensiveMove':1310,'quietMove':800,'advancedPawn':1100,'kingsideAttack':1450,'short':9300,'long':5100,'crushing':8200,'advantage':7600}})
            if path == '/api/watch/me': return self.send_json(200, {'signedIn':False,'isAdmin':False,'canReviewStreamers':False})
            if path == '/api/watch/events':
                o = others()
                return self.send_json(200, {'live':[summ(e), o[0]],'upcoming':[o[1]],'recent':[o[2]],'managed':[]})
            m = re.match(r'^/api/watch/events/([\w-]+)$', path)
            if m:
                if m.group(1) == 'berlin': return self.send_json(200, {'event': e})
                return self.send_json(404, {'error':'Event not found'})
            m = re.match(r'^/api/watch/games/([\w-]+)$', path)
            if m:
                for r in rounds:
                    for g in r['games']:
                        if g['id'] == m.group(1):
                            full = {k:v for k,v in g.items() if k!='_moves'}
                            mv = g['_moves']
                            full.update({'eventId':'berlin','eventName':e['name'],'roundName':r['name'],'initialFen':START,'moves':mv,'clocks':[5_400_000 - i*35_000 for i in range(len(mv))]})
                            return self.send_json(200, {'game': full})
                return self.send_json(404, {'error':'Game not found'})
            if path == '/api/watch/streamers': return self.send_json(200, {'streamers': streamers()})
            m = re.match(r'^/api/watch/streamers/([\w-]+)$', path)
            if m: return self.send_json(200, {'streamer': next((s for s in streamers() if s['userId']==m.group(1)), None)})
            return self.send_json(404, {'error':'Not found'})
        # Phone-sized frame: headless Chrome will not make its window narrower than ~500px,
        # so mobile screenshots render the page inside a frame of the phone's width.
        if path == '/__phone':
            from urllib.parse import parse_qs, urlparse
            q = parse_qs(urlparse(self.path).query)
            w = int(q.get('w', ['430'])[0]); h = int(q.get('h', ['932'])[0]); src = q.get('p', ['/'])[0]
            html = f'<!doctype html><html><body style="margin:0;background:#fff"><iframe src="{src}" style="width:{w}px;height:{h}px;border:0;display:block"></iframe></body></html>'.encode()
            self.send_response(200); self.send_header('content-type','text/html'); self.send_header('content-length',str(len(html))); self.end_headers(); self.wfile.write(html); return
        # static site
        rel = path.lstrip('/') or 'index.html'
        cands = [rel, rel + '.html', os.path.join(rel, 'index.html')]
        parts = rel.split('/')
        # dynamic routes: replace segments with [param] files
        for i in range(len(parts)-1, -1, -1):
            d = os.path.join(DIST, *parts[:i])
            if os.path.isdir(d):
                for f in os.listdir(d):
                    if f.startswith('[') and (f.endswith('].html') and i == len(parts)-1):
                        cands.append(os.path.join(*parts[:i], f))
                    if f.startswith('[') and f.endswith(']') and os.path.isdir(os.path.join(d,f)):
                        rest = '/'.join(parts[i+1:])
                        cands += [os.path.join(*parts[:i], f, rest + '.html'), os.path.join(*parts[:i], f, rest)]
        cands.append('index.html')
        for c in cands:
            fp = os.path.join(DIST, c)
            if os.path.isfile(fp):
                data = open(fp,'rb').read()
                if fp.endswith('.html'):
                    # Skip the welcome screen: browse as a guest.
                    data = data.replace(b'<head>', b"<head><script>try{localStorage.setItem('chessmate.auth.guest','Guest4821')}catch(e){}</script>", 1)
                ct = 'text/html' if fp.endswith('.html') else 'application/javascript' if fp.endswith('.js') else 'text/css' if fp.endswith('.css') else 'image/png' if fp.endswith('.png') else 'font/ttf' if fp.endswith('.ttf') else 'font/otf' if fp.endswith('.otf') else 'application/octet-stream'
                self.send_response(200); self.send_header('content-type', ct); self.send_header('content-length', str(len(data))); self.end_headers(); self.wfile.write(data); return
        self.send_response(404); self.end_headers()

ThreadingHTTPServer(('127.0.0.1', 8099), Handler).serve_forever()
