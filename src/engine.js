/**
 * The correction engine, shared by the host half and its tests.
 *
 * Pure functions and plain data only: no fs, no DOM, no network. The host loads
 * the word list from disk once and hands it to `createEngine`; the browser half
 * does all of its matching against the arrays this file produces.
 *
 * WHY A RANKED LIST AND NOT A BIG UNORDERED SET
 *
 * A set answers "is this a word", which is half the job. The other half is
 * "which word did they mean", and that is decided almost entirely by how common
 * the candidate is: `theh` sits one edit from `the`, `teh`, `eth` and a dozen
 * rare tokens, and only frequency ordering puts `the` on top where a Tab press
 * will accept it.
 *
 * @module dsh-spell-check/engine
 */

/**
 * Misspellings frequent enough to answer without any edit-distance search.
 *
 * Kept separate from the ranked list on purpose: these are the corrections a
 * user expects to be instant and unambiguous, and several of them (`wont`,
 * `cant`, `dont`) are only misspellings in the aphetic sense — the apostrophe
 * is missing, not a letter.
 */
export const TYPO_MAP = {
  teh: 'the',
  hte: 'the',
  th: 'the',
  theh: 'the',
  rhe: 'the',
  tthe: 'the',
  adn: 'and',
  nad: 'and',
  anc: 'and',
  ahev: 'have',
  hvae: 'have',
  jsut: 'just',
  juts: 'just',
  taht: 'that',
  thta: 'that',
  thsi: 'this',
  tihs: 'this',
  wiht: 'with',
  waht: 'what',
  hwat: 'what',
  yuo: 'you',
  yuor: 'your',
  fro: 'for',
  ofr: 'for',
  fomr: 'from',
  from: 'from',
  ot: 'to',
  nto: 'not',
  ntoe: 'note',
  woudl: 'would',
  wuold: 'would',
  coudl: 'could',
  shoudl: 'should',
  shuold: 'should',
  abotu: 'about',
  baout: 'about',
  whcih: 'which',
  wich: 'which',
  hwihc: 'which',
  becuase: 'because',
  becasue: 'because',
  beacuse: 'because',
  becouse: 'because',
  ther: 'there',
  thier: 'their',
  thier: 'their',
  tehre: 'there',
  thre: 'there',
  recieve: 'receive',
  recieved: 'received',
  recieving: 'receiving',
  beleive: 'believe',
  belive: 'believe',
  wieght: 'weight',
  freind: 'friend',
  freinds: 'friends',
  feild: 'field',
  gard: 'guard',
  huose: 'house',
  seperate: 'separate',
  seperated: 'separated',
  seperately: 'separately',
  definately: 'definitely',
  definatly: 'definitely',
  defintely: 'definitely',
  occured: 'occurred',
  occuring: 'occurring',
  ocurred: 'occurred',
  succesful: 'successful',
  successfull: 'successful',
  sucessful: 'successful',
  neccessary: 'necessary',
  necesary: 'necessary',
  neccessarily: 'necessarily',
  accomodate: 'accommodate',
  acommodate: 'accommodate',
  adress: 'address',
  adres: 'address',
  arguement: 'argument',
  begining: 'beginning',
  begining: 'beginning',
  calender: 'calendar',
  commited: 'committed',
  comming: 'coming',
  completly: 'completely',
  concious: 'conscious',
  curiousity: 'curiosity',
  exsistance: 'existence',
  existance: 'existence',
  familar: 'familiar',
  finaly: 'finally',
  foriegn: 'foreign',
  gaurd: 'guard',
  goverment: 'government',
  guarentee: 'guarantee',
  happend: 'happened',
  hieght: 'height',
  immediatly: 'immediately',
  independant: 'independent',
  intresting: 'interesting',
  knowlege: 'knowledge',
  liesure: 'leisure',
  maintainance: 'maintenance',
  milisecond: 'millisecond',
  miliseconds: 'milliseconds',
  millisecond: 'millisecond',
  neice: 'niece',
  noticable: 'noticeable',
  occassion: 'occasion',
  ocassion: 'occasion',
  oppurtunity: 'opportunity',
  oportunity: 'opportunity',
  paralel: 'parallel',
  parliment: 'parliament',
  perseverence: 'perseverance',
  posession: 'possession',
  prefered: 'preferred',
  priviledge: 'privilege',
  probaly: 'probably',
  probally: 'probably',
  proccess: 'process',
  proces: 'process',
  pronounciation: 'pronunciation',
  publically: 'publicly',
  questionaire: 'questionnaire',
  reccomend: 'recommend',
  recomend: 'recommend',
  refered: 'referred',
  relevent: 'relevant',
  religous: 'religious',
  rember: 'remember',
  rememberance: 'remembrance',
  resistence: 'resistance',
  responsability: 'responsibility',
  rythm: 'rhythm',
  scedule: 'schedule',
  shedule: 'schedule',
  schedual: 'schedule',
  sieze: 'seize',
  similiar: 'similar',
  sincerly: 'sincerely',
  speach: 'speech',
  strentgh: 'strength',
  succesfully: 'successfully',
  suprise: 'surprise',
  supress: 'suppress',
  temperture: 'temperature',
  tendancy: 'tendency',
  threshhold: 'threshold',
  tommorow: 'tomorrow',
  tomorow: 'tomorrow',
  tounge: 'tongue',
  truely: 'truly',
  twelth: 'twelfth',
  tyrany: 'tyranny',
  unecessary: 'unnecessary',
  unfortunatly: 'unfortunately',
  untill: 'until',
  useable: 'usable',
  vaccum: 'vacuum',
  vehical: 'vehicle',
  visable: 'visible',
  wether: 'whether',
  wheter: 'whether',
  wierd: 'weird',
  wihch: 'which',
  writting: 'writing',
  writen: 'written',
  yeild: 'yield',
  // Keyboard-adjacency and transposition slips common when typing fast.
  atuo: 'auto',
  autp: 'auto',
  auot: 'auto',
  conntextion: 'connection',
  connecton: 'connection',
  conection: 'connection',
  connetion: 'connection',
  contection: 'connection',
  trype: 'type',
  tyep: 'type',
  tpye: 'type',
  yuor: 'your',
  foce: 'force',
  focre: 'force',
  foramtting: 'formatting',
  formating: 'formatting',
  compnent: 'component',
  componet: 'component',
  compnents: 'components',
  compont: 'component',
  modle: 'model',
  modul: 'module',
  moduels: 'modules',
  fitler: 'filter',
  filtet: 'filter',
  seach: 'search',
  serach: 'search',
  sarach: 'search',
  sesion: 'session',
  sesssion: 'session',
  settngs: 'settings',
  setings: 'settings',
  writng: 'writing',
  renderng: 'rendering',
  bulid: 'build',
  buidl: 'build',
  updatng: 'updating',
  instaled: 'installed',
  instal: 'install',
  plugn: 'plugin',
  plugni: 'plugin',
  plguin: 'plugin',
  pkg: 'package',
  pakage: 'package',
  packge: 'package',
  importat: 'important',
  importnat: 'important',
  definintion: 'definition',
  defualt: 'default',
  defualts: 'defaults',
  defalut: 'default',
  retrun: 'return',
  reutrn: 'return',
  retun: 'return',
  funciton: 'function',
  fucntion: 'function',
  functoin: 'function',
  paramter: 'parameter',
  paramaters: 'parameters',
  paramters: 'parameters',
  vlaue: 'value',
  vaule: 'value',
  vaue: 'value',
  strign: 'string',
  stirng: 'string',
  strng: 'string',
  arary: 'array',
  arrya: 'array',
  ojbect: 'object',
  objetc: 'object',
  oject: 'object',
  prpoerty: 'property',
  proprty: 'property',
  porperty: 'property',
  evnet: 'event',
  evet: 'event',
  keyboad: 'keyboard',
  keybaord: 'keyboard',
  defualty: 'default',
  resposne: 'response',
  reponse: 'response',
  reqeust: 'request',
  requets: 'request',
  reqest: 'request',
  errror: 'error',
  erro: 'error',
  excpetion: 'exception',
  exeption: 'exception',
  acount: 'account',
  achive: 'archive',
  alos: 'also',
  alwyas: 'always',
  awlays: 'always',
  alywas: 'always',
  aroudn: 'around',
  aroud: 'around',
  bacause: 'because',
  bceause: 'because',
  begn: 'begin',
  belwo: 'below',
  betwen: 'between',
  betweeen: 'between',
  bufery: 'buffer',
  bufffer: 'buffer',
  becnh: 'bench',
  cetner: 'center',
  chekc: 'check',
  chek: 'check',
  chiuld: 'child',
  chidl: 'child',
  cleaer: 'clear',
  cler: 'clear',
  cnahge: 'change',
  chagne: 'change',
  chnaged: 'changed',
  cofnig: 'config',
  cofig: 'config',
  configg: 'config',
  confg: 'config',
  consdier: 'consider',
  cosnole: 'console',
  consoel: 'console',
  contorl: 'control',
  cotnrol: 'control',
  contro: 'control',
  coords: 'coords',
  covearge: 'coverage',
  cuase: 'cause',
  cuases: 'causes',
  curent: 'current',
  cuurrent: 'current',
  curren: 'current',
  curretn: 'current',
  daat: 'data',
  datsa: 'data',
  datat: 'data',
  deatil: 'detail',
  datail: 'detail',
  detials: 'details',
  dfeault: 'default',
  diffrent: 'different',
  differnt: 'different',
  diffrently: 'differently',
  dircetory: 'directory',
  direcotry: 'directory',
  direcory: 'directory',
  documnet: 'document',
  documet: 'document',
  docuent: 'document',
  doesnot: 'does not',
  doesnt: "doesn't",
  dont: "don't",
  didnt: "didn't",
  cant: "can't",
  wont: "won't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  wouldnt: "wouldn't",
  couldnt: "couldn't",
  shouldnt: "shouldn't",
  hasnt: "hasn't",
  havent: "haven't",
  im: "I'm",
  ive: "I've",
  thats: "that's",
  ivee: "I've",
  eeven: 'even',
  enbale: 'enable',
  enalbe: 'enable',
  encodng: 'encoding',
  entyr: 'entry',
  enty: 'entry',
  enviornment: 'environment',
  enviroment: 'environment',
  envirnoment: 'environment',
  epxect: 'expect',
  exect: 'expect',
  exaple: 'example',
  examle: 'example',
  exmaple: 'example',
  exsit: 'exist',
  exsits: 'exists',
  explict: 'explicit',
  expresion: 'expression',
  expresions: 'expressions',
  extenison: 'extension',
  extnesion: 'extension',
  failre: 'failure',
  falure: 'failure',
  failuer: 'failure',
  featre: 'feature',
  feture: 'feature',
  feautre: 'feature',
  filel: 'file',
  filse: 'files',
  fiels: 'fields',
  feilds: 'fields',
  foucs: 'focus',
  focsu: 'focus',
  follw: 'follow',
  folow: 'follow',
  forgeting: 'forgetting',
  forn: 'from',
  frst: 'first',
  frist: 'first',
  fucntionality: 'functionality',
  fucntion: 'function',
  gaem: 'game',
  genrate: 'generate',
  genereate: 'generate',
  genral: 'general',
  generall: 'general',
  givenn: 'given',
  gloabl: 'global',
  gorup: 'group',
  gropu: 'group',
  gruop: 'group',
  haders: 'headers',
  heades: 'headers',
  heigth: 'height',
  hiddne: 'hidden',
  hidde: 'hidden',
  hierachy: 'hierarchy',
  hiearchy: 'hierarchy',
  higer: 'higher',
  higest: 'highest',
  hwo: 'how',
  hwoever: 'however',
  howver: 'however',
  hoever: 'however',
  iamge: 'image',
  imag: 'image',
  impelment: 'implement',
  implment: 'implement',
  implemenation: 'implementation',
  implementaiton: 'implementation',
  implemention: 'implementation',
  inlcude: 'include',
  incldue: 'include',
  inclued: 'include',
  indedx: 'index',
  inde: 'index',
  inflateed: 'inflated',
  informaiton: 'information',
  infomation: 'information',
  inforamtion: 'information',
  inheritence: 'inheritance',
  inital: 'initial',
  intial: 'initial',
  initail: 'initial',
  initialise: 'initialize',
  initilize: 'initialize',
  initialzied: 'initialized',
  inptu: 'input',
  inptu: 'input',
  inpout: 'input',
  instaed: 'instead',
  insted: 'instead',
  instrcution: 'instruction',
  instructon: 'instruction',
  intead: 'instead',
  interace: 'interface',
  interfaec: 'interface',
  intput: 'input',
  inupt: 'input',
  inver: 'invert',
  isnpect: 'inspect',
  isseu: 'issue',
  issus: 'issues',
  itesm: 'items',
  itmes: 'items',
  jsut: 'just',
  juyst: 'just',
  knwo: 'know',
  kown: 'known',
  lanugage: 'language',
  langauge: 'language',
  languge: 'language',
  lauch: 'launch',
  lciense: 'license',
  licnce: 'license',
  liek: 'like',
  lke: 'like',
  lnik: 'link',
  lniked: 'linked',
  lisence: 'license',
  lst: 'list',
  liist: 'list',
  liset: 'list',
  loadng: 'loading',
  lamnguage: 'language',
  loggin: 'logging',
  lookng: 'looking',
  maina: 'main',
  mainain: 'maintain',
  manully: 'manually',
  maunal: 'manual',
  maunally: 'manually',
  mehtod: 'method',
  methdo: 'method',
  metohd: 'method',
  mehtods: 'methods',
  methdos: 'methods',
  midle: 'middle',
  moel: 'model',
  moudle: 'module',
  moudles: 'modules',
  msut: 'must',
  mutliple: 'multiple',
  multipe: 'multiple',
  mulitple: 'multiple',
  mroe: 'more',
  mpore: 'more',
  nmae: 'name',
  nmaes: 'names',
  namse: 'names',
  naem: 'name',
  neeed: 'need',
  ned: 'need',
  nescessary: 'necessary',
  newever: 'newer',
  nex: 'next',
  nto: 'not',
  nubmer: 'number',
  numebr: 'number',
  numbr: 'number',
  numer: 'number',
  ofset: 'offset',
  offest: 'offset',
  olny: 'only',
  onyl: 'only',
  ony: 'only',
  opne: 'open',
  oepn: 'open',
  opiton: 'option',
  optioanl: 'optional',
  oprtion: 'option',
  optios: 'options',
  optons: 'options',
  ordr: 'order',
  orignal: 'original',
  orginal: 'original',
  orignal: 'original',
  outptu: 'output',
  ouput: 'output',
  ovew: 'overview',
  overide: 'override',
  overide: 'override',
  pakcage: 'package',
  paragrpah: 'paragraph',
  parrameter: 'parameter',
  patth: 'path',
  pah: 'path',
  phsical: 'physical',
  peice: 'piece',
  pices: 'pieces',
  platfrom: 'platform',
  platfom: 'platform',
  plese: 'please',
  pleae: 'please',
  pleas: 'please',
  plugn: 'plugin',
  portt: 'port',
  posible: 'possible',
  possibel: 'possible',
  prit: 'print',
  pritn: 'print',
  privte: 'private',
  priavte: 'private',
  procecss: 'process',
  proejct: 'project',
  progect: 'project',
  porject: 'project',
  propblem: 'problem',
  problme: 'problem',
  problem: 'problem',
  provde: 'provide',
  provied: 'provided',
  provder: 'provider',
  puplic: 'public',
  qeueu: 'queue',
  querey: 'query',
  queery: 'query',
  queryy: 'query',
  raelly: 'really',
  realy: 'really',
  reead: 'read',
  recrod: 'record',
  referece: 'reference',
  refrence: 'reference',
  refrences: 'references',
  regsiter: 'register',
  registr: 'register',
  registred: 'registered',
  relaod: 'reload',
  realod: 'reload',
  relase: 'release',
  relaese: 'release',
  remaing: 'remaining',
  remvoed: 'removed',
  remvoe: 'remove',
  repetion: 'repetition',
  repalce: 'replace',
  replce: 'replace',
  replcaed: 'replaced',
  requried: 'required',
  requred: 'required',
  reqired: 'required',
  requirment: 'requirement',
  requriement: 'requirement',
  resouce: 'resource',
  reosurce: 'resource',
  resrouce: 'resource',
  reuslt: 'result',
  resul: 'result',
  reslut: 'result',
  resulst: 'results',
  reuslts: 'results',
  retrived: 'retrieved',
  reveiw: 'review',
  reviw: 'review',
  rewritting: 'rewriting',
  rigth: 'right',
  rigt: 'right',
  rnu: 'run',
  runnign: 'running',
  runing: 'running',
  safly: 'safely',
  samll: 'small',
  smal: 'small',
  scehduler: 'scheduler',
  scheduelr: 'scheduler',
  sceen: 'screen',
  scrren: 'screen',
  seale: 'scale',
  seatle: 'settle',
  secion: 'section',
  seciton: 'section',
  secton: 'section',
  seelct: 'select',
  selct: 'select',
  selecet: 'select',
  selecft: 'select',
  sems: 'seems',
  sentance: 'sentence',
  sepcific: 'specific',
  specifc: 'specific',
  specfic: 'specific',
  sepcify: 'specify',
  serivce: 'service',
  servce: 'service',
  serivces: 'services',
  shoud: 'should',
  shuold: 'should',
  shwo: 'show',
  showd: 'showed',
  shwon: 'shown',
  sice: 'since',
  sigin: 'signin',
  signle: 'single',
  sngle: 'single',
  simplifed: 'simplified',
  sitll: 'still',
  slaot: 'slot',
  slto: 'slot',
  soem: 'some',
  soemthing: 'something',
  somthing: 'something',
  soruce: 'source',
  srouce: 'source',
  souce: 'source',
  specfic: 'specific',
  spped: 'speed',
  spce: 'space',
  spcae: 'space',
  spliting: 'splitting',
  srping: 'spring',
  stadard: 'standard',
  standad: 'standard',
  strcutre: 'structure',
  strucutre: 'structure',
  structre: 'structure',
  stauts: 'status',
  stataus: 'status',
  stlye: 'style',
  syte: 'style',
  sucess: 'success',
  succese: 'success',
  suport: 'support',
  supprot: 'support',
  suppord: 'support',
  suprt: 'support',
  symobl: 'symbol',
  symol: 'symbol',
  syantx: 'syntax',
  syste: 'system',
  sytem: 'system',
  systme: 'system',
  tabel: 'table',
  tabe: 'table',
  tagerts: 'targets',
  tahn: 'than',
  thna: 'than',
  taht: 'that',
  theat: 'that',
  therfore: 'therefore',
  theree: 'there',
  thigns: 'things',
  thigs: 'things',
  thnik: 'think',
  thikn: 'think',
  thniking: 'thinking',
  though: 'though',
  tihng: 'thing',
  timne: 'time',
  tmie: 'time',
  tpoic: 'topic',
  topci: 'topic',
  trz: 'try',
  trry: 'try',
  tuen: 'tune',
  turnng: 'turning',
  twise: 'twice',
  typcial: 'typical',
  typcail: 'typical',
  udner: 'under',
  uner: 'under',
  understnad: 'understand',
  unfortunatley: 'unfortunately',
  unqiue: 'unique',
  unqie: 'unique',
  unti: 'until',
  upate: 'update',
  upadte: 'update',
  updte: 'update',
  uesd: 'used',
  usd: 'used',
  useing: 'using',
  usign: 'using',
  usin: 'using',
  usally: 'usually',
  usuall: 'usually',
  usualy: 'usually',
  valdiate: 'validate',
  valiate: 'validate',
  vaule: 'value',
  vaue: 'value',
  vedio: 'video',
  viev: 'view',
  veiw: 'view',
  vido: 'video',
  wnat: 'want',
  warining: 'warning',
  warnig: 'warning',
  warnign: 'warning',
  watn: 'want',
  wehn: 'when',
  whne: 'when',
  whne: 'when',
  wehre: 'where',
  whre: 'where',
  wher: 'where',
  whle: 'while',
  whil: 'while',
  wihtout: 'without',
  wihtout: 'without',
  witout: 'without',
  wkith: 'with',
  wokr: 'work',
  wroking: 'working',
  wrok: 'work',
  wroks: 'works',
  wrold: 'world',
  wordl: 'world',
  woud: 'would',
  wuold: 'would',
  woudl: 'would',
  writting: 'writing',
  wrapepr: 'wrapper',
  wraper: 'wrapper',
  wrriten: 'written',
  yoru: 'your',
  yuo: 'you',
  yuor: 'your',
  zeor: 'zero',
  zreo: 'zero',
}

/** The largest edit distance worth showing. Beyond two, suggestions are noise. */
export const MAX_DISTANCE = 2

/** Below this length a "correction" is a different word, not a typo. */
export const MIN_LENGTH = 3

/** Learned words rank after the whole shipped list, never above it. */
const LEARNED_RANK_BASE = 1_000_000

/**
 * Optimal-string-alignment Damerau-Levenshtein, with an early exit.
 *
 * Straight Levenshtein would not explain the most common fast-typing slip of
 * all — two adjacent letters swapped (`atuo`, `teh`, `recieve`) — which costs it
 * two edits and would fall outside a distance-2 budget on longer words.
 *
 * Returns `limit + 1` as soon as a row's best score exceeds the budget, so a
 * hopeless candidate is abandoned without finishing the matrix.
 */
export function distance(a, b, limit = MAX_DISTANCE) {
  const al = a.length
  const bl = b.length
  const ceiling = limit + 1
  if (Math.abs(al - bl) > limit) return ceiling
  if (a === b) return 0

  // Three rows, rotated: `prev` is row i-1, `prev2` is row i-2 (transpositions
  // need the row before that one), `curr` is scratch for row i.
  let prev2 = new Array(bl + 1)
  let prev = new Array(bl + 1)
  let curr = new Array(bl + 1)
  for (let j = 0; j <= bl; j += 1) {
    prev[j] = j
    prev2[j] = j
  }

  for (let i = 1; i <= al; i += 1) {
    curr[0] = i
    let rowBest = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= bl; j += 1) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      let v = prev[j] + 1
      const insertion = curr[j - 1] + 1
      if (insertion < v) v = insertion
      const substitution = prev[j - 1] + cost
      if (substitution < v) v = substitution
      if (
        i > 1 &&
        j > 1 &&
        ca === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        const transposition = prev2[j - 2] + 1
        if (transposition < v) v = transposition
      }
      curr[j] = v
      if (v < rowBest) rowBest = v
    }
    // No cell on this row can be within budget any more: abandon the candidate.
    if (rowBest > limit) return ceiling
    const recycled = prev2
    prev2 = prev
    prev = curr
    curr = recycled
  }
  return prev[bl]
}

/** Title-case the first letter only, so `Teh` corrects to `The`. */
export function matchCase(original, replacement) {
  if (original.length === 0) return replacement
  const first = original[0]
  if (first !== first.toUpperCase() || first === first.toLowerCase()) return replacement
  const rest = original.slice(1)
  // An all-caps token is an acronym, not a typo — leave it alone.
  if (rest === rest.toUpperCase() && rest !== rest.toLowerCase()) return replacement
  return replacement[0].toUpperCase() + replacement.slice(1)
}

/**
 * Build the suggestion index over a frequency-ranked word list.
 *
 * @param words - Most common first. Index in this array IS the frequency rank.
 * @param typoMap - Exact misspelling → correction pairs, answered instantly.
 */
export function createEngine(words, typoMap = TYPO_MAP) {
  const rank = new Map()
  /** Bucket key `first letter + length` → candidate words, for a bounded scan. */
  const buckets = new Map()

  const list = Array.isArray(words) ? words : []
  for (let i = 0; i < list.length; i += 1) {
    const w = list[i]
    if (typeof w !== 'string' || w.length === 0) continue
    if (rank.has(w)) continue
    rank.set(w, i)
    for (let len = Math.max(MIN_LENGTH, w.length - MAX_DISTANCE); len <= w.length + MAX_DISTANCE; len += 1) {
      const key = w[0] + ':' + len
      const bucket = buckets.get(key)
      if (bucket === undefined) buckets.set(key, [w])
      else bucket.push(w)
    }
  }

  /** Correct spellings the user has taught us; always treated as valid. */
  const learned = new Set()

  function isWord(word) {
    return rank.has(word) || learned.has(word)
  }

  function addWord(word) {
    const w = String(word ?? '').trim().toLowerCase()
    if (!/^[a-z][a-z'-]*$/.test(w)) return false
    if (rank.has(w)) return true
    learned.add(w)
    // Learned words are indexed too, at the very bottom of the ranking: a word
    // the user taught us must still be able to WIN a correction (`courtkeyne`
    // → `courtkeynet`), it just should not outrank everyday vocabulary.
    rank.set(w, rank.size + LEARNED_RANK_BASE)
    for (let len = Math.max(MIN_LENGTH, w.length - MAX_DISTANCE); len <= w.length + MAX_DISTANCE; len += 1) {
      const key = w[0] + ':' + len
      const bucket = buckets.get(key)
      if (bucket === undefined) buckets.set(key, [w])
      else bucket.push(w)
    }
    return true
  }

  /**
   * Ranked corrections for one typed token, best first.
   *
   * Answers `[]` for anything already spelled correctly — correcting a real
   * word is Chrome's most annoying behaviour (`hoe` → `how`), and the ranked
   * list is what makes that check meaningful.
   */
  function suggest(word, options = {}) {
    const raw = String(word ?? '')
    if (raw.length < MIN_LENGTH) return []
    if (!/^[A-Za-z][A-Za-z'’-]*$/.test(raw)) return []
    // A fully upper-case token is an acronym (API, DSH, PDF), never a typo.
    if (raw.length > 1 && raw === raw.toUpperCase()) return []

    const lower = raw.toLowerCase()
    const limit = Number.isInteger(options.limit) ? options.limit : 3
    const cap = Number.isInteger(options.maxDistance) ? options.maxDistance : MAX_DISTANCE

    const out = []
    const seen = new Set()

    const direct = typoMap?.[lower]
    if (typeof direct === 'string' && direct !== lower) {
      out.push({ word: matchCase(raw, direct), distance: 0, source: 'typo-map' })
      seen.add(direct)
    }

    if (isWord(lower)) return out.slice(0, limit)

    const firstBuckets = []
    for (let len = Math.max(MIN_LENGTH, lower.length - cap); len <= lower.length + cap; len += 1) {
      const bucket = buckets.get(lower[0] + ':' + len)
      if (bucket !== undefined) firstBuckets.push(bucket)
    }

    const hits = []
    /** A word is filed in several length buckets, so it can be met more than once. */
    const counted = new Set()
    for (const bucket of firstBuckets) {
      for (const candidate of bucket) {
        if (seen.has(candidate) || counted.has(candidate)) continue
        const d = distance(lower, candidate, cap)
        if (d > cap) continue
        counted.add(candidate)
        hits.push({ word: candidate, distance: d, rank: rank.get(candidate) ?? Infinity })
      }
    }

    // Distance first: one edit away always beats two, however rare. Among
    // equally distant candidates the commoner word wins, which is what puts
    // `the` above `eth` for `theh`.
    hits.sort((a, b) => a.distance - b.distance || a.rank - b.rank)

    for (const hit of hits) {
      if (out.length >= limit) break
      out.push({ word: matchCase(raw, hit.word), distance: hit.distance, source: 'distance' })
    }
    return out
  }

  return { suggest, isWord, addWord, learned: () => [...learned], size: rank.size }
}

export default { TYPO_MAP, MAX_DISTANCE, MIN_LENGTH, distance, matchCase, createEngine }