const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { json } = require('body-parser');
const mercadopago = require('mercadopago');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "stevejobs"; // use variável de ambiente no Render
const MAX_MOEDAS_AUMENTO = 10000;
const MAX_XP_AUMENTO = 10000;
const MAX_SPINS_AUMENTO = 100;
const MAX_TEMPO_JOGO_AUMENTO = 1440;

function normalizarInteiro(valor, padrao = 0) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return padrao;
  }
  return Math.max(0, Math.floor(numero));
}

function validarDelta(valorNovo, valorAtual, limite, campo) {
  const delta = valorNovo - valorAtual;

  if (valorNovo < 0) {
    return { ok: false, mensagem: `${campo} não pode ser negativo.` };
  }

  if (Math.abs(delta) > limite) {
    return { ok: false, mensagem: `${campo} mudou demais de uma vez (${Math.abs(delta)} > ${limite}).` };
  }

  return { ok: true };
}

app.use(express.json({ limit: '50mb' })); // Aumentar limite de tamanho
app.use(cors({
    origin: ["https://neeexusbr.github.io", "https://neeexusbr.netlify.app/", "http://localhost:3000", "http://localhost:5500"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// Configura Mercado Pago (usa as variáveis de ambiente MERCADO_PAGO_ACCESS_TOKEN ou MP_ACCESS_TOKEN)
const MP_TOKEN = process.env.MP_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
if (MP_TOKEN) {
  mercadopago.configure({ access_token: MP_TOKEN });
} else {
  console.warn('Aviso: token do Mercado Pago não encontrado em variáveis de ambiente. Rota /api/pagamento exigirá configuração.');
}

//MongoDB
mongoose.connect("mongodb+srv://Admin:cleusaaposentou@nexusgames.96iuubq.mongodb.net/?appName=nexusgames")
  .then(() => console.log("Conectado ao MongoDB Atlas"))
  .catch(err => console.error("Erro na conexão:", err));

// Modelo Usuario
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
  nome: { type: String, unique: true },
  senha: String,
  moedas: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },
  tipoAdmin: { type: String, default: null }, // null, 'admin', ou 'headAdmin'
  jogosSecretos: [String],
  itensComprados: [String],
  tempo_jogo: { type: Number, default: 0 },
  spins: { type: Number, default: 0 }, // Giros da roleta
  tagPersonalizada: { type: String, default: '' },
  corTagPersonalizada: { type: String, default: '#a855f7' }, // roxo padrão
  tipoCorTag: { type: String, default: 'comum' }, // 'comum' ou 'especial'
  foto_perfil: { type: String, default: '' },
  bio: { type: String, default: '' },
  infiniteCoins: { type: Boolean, default: false },
  infiniteSpins: { type: Boolean, default: false },
  lastDailyRewardDate: { type: String, default: null },
  corBordaPerfil: { type: String, default: '#ffd700' }, // cor da borda do perfil
  idCorBordaPerfil: { type: String, default: 'gold' }, // id da cor de borda selecionada
  rank: { type: Number, default: 1 }, // Rank do usuário (1-30)
  xp: { type: Number, default: 0 }, // Experiência atual do usuário
  premiumXp: { type: Boolean, default: false }, // Premium: dobra XP ganhado
  banidoAte: { type: Date, default: null },
  banMotivo: { type: String, default: '' }
  ,
  pendingAlert: {
    title: { type: String, default: '' },
    message: { type: String, default: '' },
    codigo: { type: String, default: null },
    tipo: { type: String, default: null },
    createdAt: { type: Date, default: null }
  },
  lastSeenAt: { type: Date, default: Date.now }
}));

// Modelo Backup
const Backup = mongoose.model('Backup', new mongoose.Schema({
  usuario: { type: String, required: true, unique: true },
  dados: { type: Object, default: {} },
  atualizadoEm: { type: Date, default: Date.now }
}));

// Modelo Compra (para rastrear compras na loja)
const Compra = mongoose.model('Compra', new mongoose.Schema({
  usuario: { type: String, required: true },
  itemId: { type: String, required: true },
  itemNome: { type: String, required: true },
  preco: { type: Number, required: true },
  data: { type: Date, default: Date.now }
}));

// Modelo Solicitacao (para autorização de ações)
const Solicitacao = mongoose.model('Solicitacao', new mongoose.Schema({
  tipo: { type: String, required: true }, // 'moedas', 'item', 'jogo', etc
  solicitadoPor: { type: String, required: true }, // admin que fez a solicitação
  destinatario: { type: String, required: true }, // usuário que receberá
  descricao: { type: String, required: true }, // ex: "Adicionar 1000 moedas"
  detalhes: { type: Object, default: {} }, // dados específicos da solicitação
  status: { type: String, default: 'pendente' }, // pendente, aprovada, rejeitada
  criadaEm: { type: Date, default: Date.now },
  respondidaEm: { type: Date, default: null },
  respondidoPor: { type: String, default: null } // quem respondeu
}));

// Modelo de códigos promocionais
const CodigoPromocional = mongoose.model('CodigoPromocional', new mongoose.Schema({
  codigo: { type: String, required: true, unique: true, uppercase: true, trim: true },
  descricao: { type: String, default: '' },
  tipoRecompensa: { type: String, enum: ['moedas', 'item', 'spins', 'jogo', 'tempo-jogo'], default: 'moedas' },
  valor: { type: Number, default: 0 },
  itemId: { type: String, default: '' },
  itemNome: { type: String, default: '' },
  jogoId: { type: String, default: '' },
  dataExpiracao: { type: Date, default: null },
  maxUsos: { type: Number, default: 1 },
  usosAtuais: { type: Number, default: 0 },
  usoUnicoPorPessoa: { type: Boolean, default: false },
  ativo: { type: Boolean, default: true },
  criadoPor: { type: String, required: true },
  criadoEm: { type: Date, default: Date.now },
  usadosPor: [{ type: String }],
  detalhes: { type: Object, default: {} }
}));

// === MODELOS DE CHAT ===
// Modelo para Mensagens Globais
const MensagemGlobal = mongoose.model('MensagemGlobal', new mongoose.Schema({
  usuario: { type: String, required: true },
  mensagem: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  criada_em: { type: Date, default: Date.now }
}));

// Modelo para Mensagens Privadas
const MensagemPrivada = mongoose.model('MensagemPrivada', new mongoose.Schema({
  remetente: { type: String, required: true },
  destinatario: { type: String, required: true },
  mensagem: { type: String, required: true },
  lida: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  criada_em: { type: Date, default: Date.now }
}));

// Cadastro
// Registro
app.post("/registrar", async (req, res) => {
  try {
    const { nome, senha } = req.body;
    const existente = await Usuario.findOne({ nome });
    if (existente) {
      return res.status(400).json({ ok: false, mensagem: "Usuário já existe!" });
    }

    const hash = await bcrypt.hash(senha, 10);
    const novoUsuario = new Usuario({ nome, senha: hash });
    await novoUsuario.save();

    const token = jwt.sign({ nome: novoUsuario.nome, isAdmin: novoUsuario.isAdmin }, SECRET, { expiresIn: "30d" });
    res.json({ ok: true, mensagem: "Conta criada com sucesso!", token, isAdmin: novoUsuario.isAdmin });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao criar conta: " + err.message });
  }
});

app.get('/api/ultimo-commit', async (req, res) => {
    const owner = "neeexusbr";
    const repo = "games";

    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits`, {
            headers: {
                "Authorization": `token ${process.env.GITHUB_TOKEN}`
            }
        });

        const commits = await response.json();
        const ultimoCommit = commits[0].commit.committer.date;
        res.json({ date: ultimoCommit });
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar commit" });
    }
});

// Teste de CORS
app.get('/teste-cors', (req, res) => {
  res.json({ ok: true, mensagem: "CORS funcionando corretamente!" });
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { nome, senha } = req.body;
    const usuario = await Usuario.findOne({ nome });
    if (!usuario) {
      return res.status(400).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    const valido = await bcrypt.compare(senha, usuario.senha);
    if (!valido) {
      return res.status(400).json({ ok: false, mensagem: "Senha incorreta!" });
    }

    if (usuario.banidoAte && usuario.banidoAte > new Date()) {
      return res.status(403).json({ ok: false, bloqueado: true, mensagem: `Você foi banido até ${usuario.banidoAte.toLocaleString('pt-BR')}. Motivo: ${usuario.banMotivo || 'Não informado.'}`, banidoAte: usuario.banidoAte, motivo: usuario.banMotivo || '' });
    }
    if (usuario.banidoAte) {
      usuario.banidoAte = null;
      usuario.banMotivo = '';
      await usuario.save();
    }

    const token = jwt.sign({ nome: usuario.nome, isAdmin: usuario.isAdmin }, SECRET, { expiresIn: "30d" });
    res.json({ ok: true, mensagem: "Login realizado com sucesso!", token, isAdmin: usuario.isAdmin });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro no login: " + err.message });
  }
});

app.post("/trocar-senha", autenticar, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    const conta = await Usuario.findOne({ nome: req.usuario.nome });

    if (!conta) {
      return res.status(404).json({ ok: false, mensagem: "Conta não encontrada." });
    }

    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ ok: false, mensagem: "Senha atual e nova senha são obrigatórias." });
    }

    const senhaValida = await bcrypt.compare(senhaAtual, conta.senha);
    if (!senhaValida) {
      return res.status(401).json({ ok: false, mensagem: "Senha atual incorreta." });
    }

    if (String(novaSenha).length < 4) {
      return res.status(400).json({ ok: false, mensagem: "A nova senha deve ter pelo menos 4 caracteres." });
    }

    conta.senha = await bcrypt.hash(String(novaSenha), 10);
    await conta.save();

    res.json({ ok: true, mensagem: "Senha alterada com sucesso!" });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao trocar senha: " + err.message });
  }
});

app.post("/trocar-nome", autenticar, async (req, res) => {
  try {
    const { nome } = req.body;
    const novoNome = String(nome || '').trim();

    if (!novoNome) {
      return res.status(400).json({ ok: false, mensagem: "Informe um nome válido." });
    }

    if (novoNome.length > 20) {
      return res.status(400).json({ ok: false, mensagem: "O nome deve ter no máximo 20 caracteres." });
    }

    const conta = await Usuario.findOne({ nome: req.usuario.nome });
    if (!conta) {
      return res.status(404).json({ ok: false, mensagem: "Conta não encontrada." });
    }

    const nomeExistente = await Usuario.findOne({ nome: novoNome });
    if (nomeExistente && nomeExistente._id.toString() !== conta._id.toString()) {
      return res.status(400).json({ ok: false, mensagem: "Esse nome de usuário já está em uso." });
    }

    conta.nome = novoNome;
    await conta.save();

    const token = jwt.sign({ nome: conta.nome, isAdmin: conta.isAdmin }, SECRET, { expiresIn: "30d" });
    res.json({ ok: true, mensagem: "Nome alterado com sucesso!", token });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao trocar nome: " + err.message });
  }
});

function autenticar(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  console.log('[AUTH] Header:', authHeader?.substring(0, 50) + '...');
  console.log('[AUTH] Token existe:', !!token);

  if (!token) {
    console.log('[AUTH] ERRO: Token não fornecido!');
    return res.status(401).json({ ok: false, mensagem: "Token não fornecido!" });
  }

  jwt.verify(token, SECRET, async (err, usuario) => {
    if (err) {
      console.log('[AUTH] ERRO ao verificar token:', err.message);
      return res.status(403).json({ ok: false, mensagem: "Token inválido ou expirado! " + err.message });
    }
    console.log('[AUTH] Token válido para usuário:', usuario.nome);
    const conta = await Usuario.findOne({ nome: usuario.nome });
    if (!conta) return res.status(401).json({ ok: false, mensagem: "Conta não encontrada." });
    if (conta.banidoAte && conta.banidoAte > new Date()) {
      return res.status(403).json({ ok: false, bloqueado: true, mensagem: `Você foi banido até ${conta.banidoAte.toLocaleString('pt-BR')}. Motivo: ${conta.banMotivo || 'Não informado.'}`, banidoAte: conta.banidoAte, motivo: conta.banMotivo || '' });
    }
    if (conta.banidoAte) {
      conta.banidoAte = null;
      conta.banMotivo = '';
      await conta.save();
    }
    req.usuario = usuario;
    next();
  });
}


// Salvar backup (rota protegida)
app.post("/salvarBackup", autenticar, async (req, res) => {
  try {
    const { dados } = req.body;

    // Validar tamanho máximo (500KB)
    const tamanho = JSON.stringify(dados).length;
    if (tamanho > 500 * 1024) {
      return res.status(413).json({ 
        ok: false, 
        mensagem: `Backup muito grande (${(tamanho/1024).toFixed(2)}KB). Máximo: 500KB` 
      });
    }

    // Salvar backup com estrutura otimizada
    await Backup.updateOne(
      { usuario: req.usuario.nome },
      { 
        dados: {
          dados: dados.dados || {},
          achievements: dados.achievements || [],
          unlockedGames: dados.unlockedGames || [],
          purchasedItems: dados.purchasedItems || [],
          preferences: dados.preferences || {},
          timestamp: dados.timestamp || new Date().toISOString()
        },
        atualizadoEm: new Date() 
      },
      { upsert: true }
    );

    console.log(`[BACKUP] Usuário ${req.usuario.nome} - ${(tamanho/1024).toFixed(2)}KB`);
    res.json({ ok: true, mensagem: "Backup salvo com sucesso!" });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao salvar backup: " + err.message });
  }
});

app.get("/carregarBackup", autenticar, async (req, res) => {
  try {
    const backup = await Backup.findOne({ usuario: req.usuario.nome });

    if (!backup || !backup.dados) {
      return res.json({ ok: false, dados: null, mensagem: "Nenhum backup encontrado." });
    }

    // 1. Converte o documento do Mongoose para um objeto JS puro
    const backupPuro = backup.toObject();
    
    // 2. 'backupPuro.dados' já contém exatamente a estrutura correta (com achievements, unlockedGames, etc.)
    const dadosRetorno = backupPuro.dados;

    // 3. Garante que se o front-end antigo procurar por dadosBackup.dados, ele não quebre:
    if (!dadosRetorno.dados) {
      dadosRetorno.dados = {
        userCoins: dadosRetorno.userCoins,
        userPlaytime: dadosRetorno.userPlaytime,
        userTag: dadosRetorno.userTag,
        userTagColor: dadosRetorno.userTagColor,
        userTagColorType: dadosRetorno.userTagColorType,
        userProfilePic: dadosRetorno.userProfilePic,
        lastDailyRewardDate: dadosRetorno.lastDailyRewardDate
      };
    }

    // 4. Preserva achievements e unlockedGames (CORREÇÃO DO BUG)
    if (!dadosRetorno.achievements) {
      dadosRetorno.achievements = [];
    }
    if (!dadosRetorno.unlockedGames) {
      dadosRetorno.unlockedGames = [];
    }

    const tamanho = JSON.stringify(dadosRetorno).length;
    console.log(`[RESTORE] Usuário ${req.usuario.nome} - ${(tamanho/1024).toFixed(2)}KB`);

    // Envia o objeto completo direto do banco sem filtros que quebrem as chaves
    res.json({ ok: true, dados: dadosRetorno });
  } catch (err) {
    console.error("Erro ao carregar backup:", err);
    res.status(500).json({ ok: false, mensagem: "Erro ao carregar backup: " + err.message });
  }
});
// === ROTAS DE ADMIN ===
function verificarAdmin(req, res, next) {
  if (!req.usuario || !req.usuario.isAdmin) {
    return res.status(403).json({ ok: false, mensagem: "Acesso negado! Você não é administrador." });
  }
  next();
}

function verificarHeadAdmin(req, res, next) {
  if (!req.usuario || req.usuario.tipoAdmin !== 'headAdmin') {
    return res.status(403).json({ ok: false, mensagem: "❌ Acesso negado! Você não é um Head Admin." });
  }
  next();
}

function verificarDogue(req, res, next) {
  if (!req.usuario || req.usuario.nome !== "Dogue") {
    return res.status(403).json({ ok: false, mensagem: "❌ Apenas Dogue tem permissão para isso!" });
  }
  next();
}

app.post("/admin/adicionar-moedas", autenticar, verificarAdmin, async (req, res) => {
  try {
    const { nomeUsuario, quantidade } = req.body;
    const usuario = await Usuario.findOne({ nome: nomeUsuario });

    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    // Se for Dogue (dono), adiciona direto sem aprovação
    if (req.usuario.nome === "Dogue") {
      usuario.moedas = (usuario.moedas || 0) + quantidade;
      await usuario.save();
      
      console.log(`[MOEDAS-DIRETO] Dogue adicionou ${quantidade} moedas direto a ${nomeUsuario}`);
      return res.json({ ok: true, mensagem: `✅ ${quantidade} moedas adicionadas direto a ${nomeUsuario}!` });
    }
    
    // Outros admins precisam criar solicitação
    const solicitacao = new Solicitacao({
      tipo: 'moedas',
      solicitadoPor: req.usuario.nome,
      destinatario: nomeUsuario,
      descricao: `${req.usuario.nome} quer adicionar ${quantidade} moedas a ${nomeUsuario}`,
      detalhes: {
        quantidade: quantidade,
        motivo: req.body.motivo || 'Sem motivo especificado'
      }
    });

    await solicitacao.save();

    console.log(`[AUTORIZAÇÃO] ${req.usuario.nome} criou solicitação para dar ${quantidade} moedas a ${nomeUsuario}`);

    res.json({ 
      ok: true, 
      mensagem: "Solicitação enviada para o dono!",
      solicitacaoId: solicitacao._id,
      isPendente: true
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

app.post("/admin/definir-infinito", autenticar, async (req, res) => {
  try {
    if (req.usuario.nome !== "Dogue") {
      return res.status(403).json({ ok: false, mensagem: "❌ Apenas Dogue pode definir status infinito!" });
    }

    const { nomeUsuario, tipo, ativo } = req.body;
    if (!nomeUsuario || !['moedas', 'giros', 'ambos'].includes(tipo)) {
      return res.status(400).json({ ok: false, mensagem: "Informe nome e tipo válido (moedas, giros ou ambos)." });
    }

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    const ativar = Boolean(ativo);
    if (tipo === 'moedas' || tipo === 'ambos') {
      usuario.infiniteCoins = ativar;
    }
    if (tipo === 'giros' || tipo === 'ambos') {
      usuario.infiniteSpins = ativar;
    }

    await usuario.save();
    res.json({ ok: true, mensagem: `✅ Status infinito atualizado para ${nomeUsuario}!`, infiniteCoins: usuario.infiniteCoins, infiniteSpins: usuario.infiniteSpins });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

app.post("/admin/desbloquear-jogo", autenticar, verificarAdmin, async (req, res) => {
  try {
    const { nomeUsuario, jogoId } = req.body;
    const usuario = await Usuario.findOne({ nome: nomeUsuario });

    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    if (!usuario.jogosSecretos.includes(jogoId)) {
      usuario.jogosSecretos.push(jogoId);
      await usuario.save();
    }

    res.json({ ok: true, mensagem: `✅ Jogo ${jogoId} desbloqueado para ${nomeUsuario}!` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

app.post("/admin/adicionar-item", autenticar, verificarAdmin, async (req, res) => {
  try {
    const { nomeUsuario, itemId } = req.body;
    const usuario = await Usuario.findOne({ nome: nomeUsuario });

    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }


    // Item comum
    if (!usuario.itensComprados.includes(itemId)) {
      usuario.itensComprados.push(itemId);
      await usuario.save();
    }

    res.json({ ok: true, mensagem: `✅ Item ${itemId} adicionado a ${nomeUsuario}!` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

app.post("/admin/definir-admin", autenticar, verificarAdmin, async (req, res) => {
  // Apenas Dogue pode promover admins
  if (!req.usuario || req.usuario.nome !== "Dogue") {
    return res.status(403).json({ ok: false, mensagem: "❌ Apenas Dogue pode promover admins!" });
  }

  try {
    const { nomeUsuario } = req.body;
    const usuario = await Usuario.findOne({ nome: nomeUsuario });

    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    usuario.isAdmin = true;
    await usuario.save();

    res.json({ ok: true, mensagem: `✅ ${nomeUsuario} agora é um administrador!` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

app.get("/admin/listar-usuarios", autenticar, verificarAdmin, async (req, res) => {
  try {
    const usuarios = await Usuario.find({}, { nome: 1, moedas: 1, isAdmin: 1, tipoAdmin: 1, lastSeenAt: 1, _id: 0 }).lean();
    const usuariosComStatus = usuarios.map(usuario => ({
      ...usuario,
      online: isUserOnline(usuario)
    }));

    res.json({ ok: true, usuarios: usuariosComStatus });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Criar código promocional (apenas Dogue)
app.post("/admin/codigos/criar", autenticar, verificarDogue, async (req, res) => {
  try {
    const {
      codigo,
      descricao,
      tipoRecompensa,
      valor,
      itemId,
      itemNome,
      jogoId,
      dataExpiracao,
      maxUsos,
      usoUnicoPorPessoa
    } = req.body;

    const codigoNormalizado = String(codigo || '').trim().toUpperCase();
    if (!codigoNormalizado) {
      return res.status(400).json({ ok: false, mensagem: "Informe um código válido." });
    }

    const tiposPermitidos = ['moedas', 'item', 'spins', 'jogo', 'tempo-jogo'];
    if (!tiposPermitidos.includes(tipoRecompensa)) {
      return res.status(400).json({ ok: false, mensagem: "Tipo de recompensa inválido." });
    }

    const valorNumero = Number(valor || 0);
    if (!Number.isFinite(valorNumero) || valorNumero <= 0) {
      return res.status(400).json({ ok: false, mensagem: "O valor da recompensa precisa ser maior que zero." });
    }

    if (tipoRecompensa === 'item' && !itemId) {
      return res.status(400).json({ ok: false, mensagem: "Informe o ID do item para este código." });
    }

    if (tipoRecompensa === 'jogo' && !jogoId) {
      return res.status(400).json({ ok: false, mensagem: "Informe o ID do jogo para este código." });
    }

    const existente = await CodigoPromocional.findOne({ codigo: codigoNormalizado });
    if (existente) {
      return res.status(400).json({ ok: false, mensagem: "Este código já existe." });
    }

    const codigoExpiracao = dataExpiracao ? new Date(dataExpiracao) : null;
    if (codigoExpiracao && Number.isNaN(codigoExpiracao.getTime())) {
      return res.status(400).json({ ok: false, mensagem: "Data de expiração inválida." });
    }

    const novoCodigo = new CodigoPromocional({
      codigo: codigoNormalizado,
      descricao: descricao || '',
      tipoRecompensa,
      valor: valorNumero,
      itemId: itemId || '',
      itemNome: itemNome || itemId || '',
      jogoId: jogoId || '',
      dataExpiracao: codigoExpiracao,
      maxUsos: Math.max(1, Number(maxUsos || 1)),
      usoUnicoPorPessoa: Boolean(usoUnicoPorPessoa),
      ativo: true,
      criadoPor: req.usuario.nome
    });

    await novoCodigo.save();

    res.json({ ok: true, mensagem: "Código criado com sucesso!", codigo: novoCodigo });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao criar código: " + err.message });
  }
});

// Listar códigos promocionais (apenas Dogue)
app.get("/admin/codigos/listar", autenticar, verificarDogue, async (req, res) => {
  try {
    const codigos = await CodigoPromocional.find({}).sort({ criadoEm: -1 });
    res.json({ ok: true, codigos });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao listar códigos: " + err.message });
  }
});

// Usar código promocional
app.post("/usar-codigo", autenticar, async (req, res) => {
  try {
    const { codigo } = req.body;
    const codigoNormalizado = String(codigo || '').trim().toUpperCase();

    if (!codigoNormalizado) {
      return res.status(400).json({ ok: false, mensagem: "Informe um código." });
    }

    const codigoPromocional = await CodigoPromocional.findOne({ codigo: codigoNormalizado });
    if (!codigoPromocional) {
      return res.status(404).json({ ok: false, mensagem: "Código inválido ou não encontrado." });
    }

    if (!codigoPromocional.ativo) {
      return res.status(400).json({ ok: false, mensagem: "Este código está desativado." });
    }

    if (codigoPromocional.dataExpiracao && new Date(codigoPromocional.dataExpiracao) < new Date()) {
      return res.status(400).json({ ok: false, mensagem: "Este código expirou." });
    }

    if (codigoPromocional.usosAtuais >= codigoPromocional.maxUsos) {
      return res.status(400).json({ ok: false, mensagem: "Este código já atingiu o limite de uso." });
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado." });
    }

    if (codigoPromocional.usoUnicoPorPessoa && codigoPromocional.usadosPor.includes(req.usuario.nome)) {
      return res.status(400).json({ ok: false, mensagem: "Você já utilizou este código." });
    }

    switch (codigoPromocional.tipoRecompensa) {
      case 'moedas':
        usuario.moedas += Number(codigoPromocional.valor || 0);
        break;
      case 'item':
        if (!usuario.itensComprados.includes(codigoPromocional.itemId)) {
          usuario.itensComprados.push(codigoPromocional.itemId);
        }
        break;
      case 'spins':
        usuario.spins += Number(codigoPromocional.valor || 0);
        break;
      case 'jogo':
        if (!usuario.jogosSecretos.includes(codigoPromocional.jogoId)) {
          usuario.jogosSecretos.push(codigoPromocional.jogoId);
        }
        break;
      case 'tempo-jogo':
        usuario.tempo_jogo += Number(codigoPromocional.valor || 0);
        break;
    }

    codigoPromocional.usosAtuais += 1;
    if (!codigoPromocional.usadosPor.includes(req.usuario.nome)) {
      codigoPromocional.usadosPor.push(req.usuario.nome);
    }

    await usuario.save();
    await codigoPromocional.save();

    res.json({
      ok: true,
      mensagem: "Código aplicado com sucesso!",
      recompensa: {
        tipo: codigoPromocional.tipoRecompensa,
        valor: codigoPromocional.valor,
        itemId: codigoPromocional.itemId,
        jogoId: codigoPromocional.jogoId
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao usar código: " + err.message });
  }
});

// === SISTEMA DE AUTORIZAÇÃO/NOTIFICAÇÕES ===
// Criar solicitação de moedas (apenas admins)
app.post("/criar-solicitacao-moedas", autenticar, verificarAdmin, async (req, res) => {
  try {
    const { nomeUsuario, quantidade } = req.body;

    if (typeof quantidade !== 'number' || quantidade <= 0) {
      return res.status(400).json({ ok: false, mensagem: "Quantidade deve ser positiva!" });
    }

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    // Criar solicitação
    const solicitacao = new Solicitacao({
      tipo: 'moedas',
      solicitadoPor: req.usuario.nome,
      destinatario: nomeUsuario,
      descricao: `${req.usuario.nome} quer adicionar ${quantidade} moedas a ${nomeUsuario}`,
      detalhes: {
        quantidade: quantidade,
        motivo: req.body.motivo || 'Sem motivo especificado'
      }
    });

    await solicitacao.save();

    console.log(`[AUTORIZAÇÃO] ${req.usuario.nome} criou solicitação para dar ${quantidade} moedas a ${nomeUsuario}`);

    res.json({ 
      ok: true, 
      mensagem: "Solicitação enviada para o dono!",
      solicitacaoId: solicitacao._id
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Listar solicitações pendentes (notificações)
app.get("/minhas-solicitacoes", autenticar, async (req, res) => {
  try {
    // Apenas Dogue pode ver as solicitações
    if (req.usuario.nome !== "Dogue") {
      return res.status(403).json({ ok: false, mensagem: "Apenas Dogue pode visualizar solicitações!" });
    }

    const solicitacoesPendentes = await Solicitacao.find(
      { status: 'pendente' },
      { _id: 1, tipo: 1, solicitadoPor: 1, destinatario: 1, descricao: 1, detalhes: 1, criadaEm: 1 }
    ).sort({ criadaEm: -1 });

    res.json({ 
      ok: true, 
      solicitacoes: solicitacoesPendentes,
      total: solicitacoesPendentes.length
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Contar solicitações pendentes (para badge de notificação)
app.get("/api/solicitacoes-pendentes", autenticar, async (req, res) => {
  try {
    // Apenas Dogue (admin) pode ver as notificações
    if (req.usuario.nome !== "Dogue") {
      return res.json({ ok: true, count: 0 });
    }

    const count = await Solicitacao.countDocuments({ status: 'pendente' });

    res.json({ 
      ok: true, 
      count: count,
      temNotificacoes: count > 0
    });
  } catch (err) {
    console.error('[NOTIF] Erro ao contar solicitações:', err);
    res.status(500).json({ ok: false, count: 0, mensagem: "Erro: " + err.message });
  }
});

// Listar histórico de solicitações
app.get("/historico-solicitacoes", autenticar, async (req, res) => {
  try {
    // Apenas Dogue pode ver o histórico
    if (req.usuario.nome !== "Dogue") {
      return res.status(403).json({ ok: false, mensagem: "Apenas Dogue pode visualizar histórico!" });
    }

    const solicitacoes = await Solicitacao.find(
      {},
      { _id: 1, tipo: 1, solicitadoPor: 1, destinatario: 1, descricao: 1, detalhes: 1, status: 1, criadaEm: 1, respondidaEm: 1, respondidoPor: 1 }
    ).sort({ criadaEm: -1 }).limit(50);

    res.json({ 
      ok: true, 
      solicitacoes: solicitacoes
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Aprovar solicitação
app.post("/aprovar-solicitacao", autenticar, verificarDogue, async (req, res) => {
  try {
    const { solicitacaoId } = req.body;

    const solicitacao = await Solicitacao.findById(solicitacaoId);
    if (!solicitacao) {
      return res.status(404).json({ ok: false, mensagem: "Solicitação não encontrada!" });
    }

    if (solicitacao.status !== 'pendente') {
      return res.status(400).json({ ok: false, mensagem: "Esta solicitação não está pendente!" });
    }

    // Aplicar a ação
    if (solicitacao.tipo === 'moedas') {
      const usuario = await Usuario.findOne({ nome: solicitacao.destinatario });
      if (!usuario) {
        return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
      }

      usuario.moedas = (usuario.moedas || 0) + solicitacao.detalhes.quantidade;
      await usuario.save();
    }

    // Marcar como aprovada
    solicitacao.status = 'aprovada';
    solicitacao.respondidaEm = new Date();
    solicitacao.respondidoPor = req.usuario.nome;
    await solicitacao.save();

    console.log(`[APROVAÇÃO] ${req.usuario.nome} aprovou solicitação #${solicitacaoId}`);

    res.json({ 
      ok: true, 
      mensagem: `✅ Solicitação aprovada! ${solicitacao.detalhes.quantidade} moedas foram adicionadas a ${solicitacao.destinatario}.`
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Rejeitar solicitação
app.post("/rejeitar-solicitacao", autenticar, verificarDogue, async (req, res) => {
  try {
    const { solicitacaoId, motivo } = req.body;

    const solicitacao = await Solicitacao.findById(solicitacaoId);
    if (!solicitacao) {
      return res.status(404).json({ ok: false, mensagem: "Solicitação não encontrada!" });
    }

    if (solicitacao.status !== 'pendente') {
      return res.status(400).json({ ok: false, mensagem: "Esta solicitação não está pendente!" });
    }

    // Marcar como rejeitada
    solicitacao.status = 'rejeitada';
    solicitacao.respondidaEm = new Date();
    solicitacao.respondidoPor = req.usuario.nome;
    solicitacao.detalhes.motivoRejeicao = motivo || 'Sem motivo especificado';
    await solicitacao.save();

    console.log(`[REJEIÇÃO] ${req.usuario.nome} rejeitou solicitação #${solicitacaoId}`);

    res.json({ 
      ok: true, 
      mensagem: `❌ Solicitação rejeitada!`
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Remover Admin (apenas Dogue)
app.post("/admin/remover-admin", autenticar, verificarDogue, async (req, res) => {
  try {
    const { nomeUsuario } = req.body;

    // Proteção para não remover Dogue
    if (nomeUsuario === "Dogue") {
      return res.status(403).json({ ok: false, mensagem: "❌ Você não pode remover admin de Dogue!" });
    }

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    if (!usuario.isAdmin) {
      return res.status(400).json({ ok: false, mensagem: "Este usuário não é um administrador!" });
    }

    usuario.isAdmin = false;
    await usuario.save();

    res.json({ ok: true, mensagem: `✅ Status de admin removido de ${nomeUsuario}!` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Mudar Tag de Usuário (apenas Dogue)
app.post("/admin/mudar-tag-usuario", autenticar, verificarDogue, async (req, res) => {
  try {
    const { nomeUsuario, novaTag } = req.body;

    if (!novaTag || novaTag.length < 1 || novaTag.length > 10) {
      return res.status(400).json({ ok: false, mensagem: "Tag deve ter entre 1 e 10 caracteres!" });
    }

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    usuario.tagPersonalizada = novaTag;
    await usuario.save();

    console.log(`[TAG-ADMIN] Dogue alterou a tag de ${nomeUsuario} para: ${novaTag}`);
    res.json({ ok: true, mensagem: `✅ Tag de ${nomeUsuario} alterada para: ${novaTag}` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Mudar Foto de Perfil de Usuário (apenas Dogue)
app.post("/admin/mudar-foto-usuario", autenticar, verificarDogue, async (req, res) => {
  try {
    const { nomeUsuario, novaFoto } = req.body;

    if (!novaFoto || novaFoto.length === 0) {
      return res.status(400).json({ ok: false, mensagem: "Foto inválida!" });
    }

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    usuario.foto_perfil = novaFoto;
    await usuario.save();

    console.log(`[PHOTO-ADMIN] Dogue alterou a foto de ${nomeUsuario}`);
    res.json({ ok: true, mensagem: `✅ Foto de ${nomeUsuario} atualizada!` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ADMIN: Mudar Cor da Borda do Usuário ===
app.post("/admin/mudar-cor-borda-usuario", autenticar, verificarAdmin, async (req, res) => {
  try {
    const { nomeUsuario, corId } = req.body;

    if (!corId) {
      return res.status(400).json({ ok: false, mensagem: "ID da cor inválido!" });
    }

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    // Mapeamento de cores
    const CORES_MAPEAMENTO = {
      'silver': '#c0c0c0',
      'red': '#ff0000',
      'blue': '#0000ff',
      'green': '#22c55e',
      'orange': '#ff8a00',
      'yellow': '#ffff00',
      'lime': '#00ff00',
      'gold': '#ffd700',
      'purple': '#a855f7',
      'cyan': '#00d4ff',
      'pink': '#ff00cc',
      'lime-glow': '#39ff14',
      'sky-blue': '#87ceeb',
      'rainbow': 'linear-gradient(90deg, #ff0000, #ff8000, #ffff00, #00ff00, #00ffff, #0000ff, #8000ff, #ff0000)'
    };

    const corValue = CORES_MAPEAMENTO[corId];
    if (!corValue) {
      return res.status(400).json({ ok: false, mensagem: "Cor desconhecida!" });
    }

    usuario.corBordaPerfil = corValue;
    usuario.idCorBordaPerfil = corId;
    await usuario.save();

    console.log(`[BORDA-ADMIN] Admin alterou cor da borda de ${nomeUsuario} para: ${corId}`);
    res.json({ ok: true, mensagem: `✅ Cor da borda de ${nomeUsuario} alterada para ${corId}!` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Banir usuário (apenas Dogue)
app.post("/admin/banir-usuario", autenticar, verificarDogue, async (req, res) => {
  try {
    const nomeUsuario = String(req.body.nomeUsuario || '').trim();
    const duracaoHoras = Number(req.body.duracaoHoras);
    const motivo = String(req.body.motivo || '').trim();
    if (!nomeUsuario || !Number.isInteger(duracaoHoras) || duracaoHoras < 1 || duracaoHoras > 87600 || !motivo) return res.status(400).json({ ok: false, mensagem: "Informe nome, duração válida (1 a 87600 horas) e motivo." });
    if (nomeUsuario === "Dogue") return res.status(403).json({ ok: false, mensagem: "A conta do dono não pode ser banida." });
    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    usuario.banidoAte = new Date(Date.now() + duracaoHoras * 60 * 60 * 1000);
    usuario.banMotivo = motivo.slice(0, 500);
    await usuario.save();
    res.json({ ok: true, mensagem: `${nomeUsuario} foi banido até ${usuario.banidoAte.toLocaleString('pt-BR')}.`, banidoAte: usuario.banidoAte });
  } catch (err) { res.status(500).json({ ok: false, mensagem: "Erro ao banir usuário: " + err.message }); }
});

// Excluir conta (apenas Dogue)
app.delete("/admin/excluir-conta", autenticar, verificarDogue, async (req, res) => {
  try {
    const nomeUsuario = String(req.body.nomeUsuario || '').trim();
    if (!nomeUsuario) return res.status(400).json({ ok: false, mensagem: "Informe o nome do usuário." });
    if (nomeUsuario === "Dogue") return res.status(403).json({ ok: false, mensagem: "A conta do dono não pode ser excluída." });
    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    await Promise.all([Usuario.deleteOne({ _id: usuario._id }), Backup.deleteOne({ usuario: nomeUsuario }), Compra.deleteMany({ usuario: nomeUsuario }), MensagemGlobal.deleteMany({ usuario: nomeUsuario }), MensagemPrivada.deleteMany({ $or: [{ remetente: nomeUsuario }, { destinatario: nomeUsuario }] }), Solicitacao.deleteMany({ $or: [{ solicitadoPor: nomeUsuario }, { destinatario: nomeUsuario }] })]);
    res.json({ ok: true, mensagem: `Conta de ${nomeUsuario} excluída permanentemente.` });
  } catch (err) { res.status(500).json({ ok: false, mensagem: "Erro ao excluir conta: " + err.message }); }
});
// Botão de Emergência - Resetar Admins (apenas Dogue)
app.post("/admin/emergencia-reset", autenticar, verificarDogue, async (req, res) => {
  try {
    // Remover admin de todos os usuários
    await Usuario.updateMany({}, { isAdmin: false });

    // Definir Dogue como único admin
    const Dogue = await Usuario.findOne({ nome: "Dogue" });
    if (Dogue) {
      Dogue.isAdmin = true;
      await Dogue.save();
    }

    console.log("[EMERGENCIA] Dogue acionou o botão de emergência - Admins resetados!");
    res.json({ ok: true, mensagem: "🚨 Emergência acionada! Todos os admins foram removidos. Apenas Dogue é admin agora." });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ROTAS DE HEAD ADMIN ===
// Promover Admin a Head Admin (apenas Dogue)
app.post("/admin/promover-head-admin", autenticar, verificarDogue, async (req, res) => {
  try {
    const { nomeUsuario } = req.body;

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "❌ Usuário não encontrado!" });
    }

    if (!usuario.isAdmin) {
      return res.status(400).json({ ok: false, mensagem: "❌ Esse usuário não é um administrador! Promova-o primeiro." });
    }

    if (usuario.tipoAdmin === 'headAdmin') {
      return res.status(400).json({ ok: false, mensagem: "❌ Esse usuário já é um Head Admin!" });
    }

    usuario.tipoAdmin = 'headAdmin';
    await usuario.save();

    console.log(`[HEAD-ADMIN] Dogue promoveu ${nomeUsuario} a Head Admin!`);
    res.json({ ok: true, mensagem: `✅ ${nomeUsuario} agora é um Head Admin! 👑` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Rebaixar Head Admin para Admin (apenas Dogue)
app.post("/admin/rebaixar-head-admin", autenticar, verificarDogue, async (req, res) => {
  try {
    const { nomeUsuario } = req.body;

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "❌ Usuário não encontrado!" });
    }

    if (usuario.tipoAdmin !== 'headAdmin') {
      return res.status(400).json({ ok: false, mensagem: "❌ Esse usuário não é um Head Admin!" });
    }

    usuario.tipoAdmin = 'admin';
    await usuario.save();

    console.log(`[HEAD-ADMIN] Dogue rebaixou ${nomeUsuario} de Head Admin para Admin!`);
    res.json({ ok: true, mensagem: `✅ ${nomeUsuario} foi rebaixado para Admin!` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Remover Head Admin (apenas Dogue)
app.post("/admin/remover-head-admin", autenticar, verificarDogue, async (req, res) => {
  try {
    const { nomeUsuario } = req.body;

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "❌ Usuário não encontrado!" });
    }

    if (usuario.tipoAdmin !== 'headAdmin') {
      return res.status(400).json({ ok: false, mensagem: "❌ Esse usuário não é um Head Admin!" });
    }

    usuario.isAdmin = false;
    usuario.tipoAdmin = null;
    await usuario.save();

    console.log(`[HEAD-ADMIN] Dogue removeu ${nomeUsuario} como Head Admin!`);
    res.json({ ok: true, mensagem: `✅ ${nomeUsuario} deixou de ser Head Admin!` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ENDPOINTS DE LEADERBOARD ===
app.get("/leaderboard", async (req, res) => {
  try {
    const usuarios = await Usuario.find({}, { nome: 1, tempo_jogo: 1, moedas: 1, foto_perfil: 1, bio: 1, infiniteCoins: 1, infiniteSpins: 1, lastDailyRewardDate: 1, tagPersonalizada: 1, corTagPersonalizada: 1, tipoCorTag: 1, corBordaPerfil: 1, idCorBordaPerfil: 1, rank: 1, isAdmin: 1, itensComprados: 1, _id: 0 })
      .sort({ tempo_jogo: -1 })
      .limit(20)
      .lean(); // Converter para objeto puro do JavaScript

    const usuariosVisiveis = usuarios.filter(user => !user.infiniteCoins && !user.infiniteSpins);

    // Distribuir prêmios
    const usuariosComPremio = usuariosVisiveis.map((user, index) => {
      let premio = 0;
      if (index === 0) premio = 10000;
      else if (index === 1) premio = 5000;
      else if (index === 2) premio = 2000;
      else if (index >= 3 && index <= 19) premio = 1500;

      return {
        nome: user.nome,
        tempo_jogo: user.tempo_jogo || 0,
        moedas: user.moedas || 0,
        foto_perfil: user.foto_perfil || '',
        tagPersonalizada: user.tagPersonalizada || '',
        corTagPersonalizada: user.corTagPersonalizada || '#a855f7',
        tipoCorTag: user.tipoCorTag || 'comum',
        corBordaPerfil: user.corBordaPerfil || '#ffd700',
        idCorBordaPerfil: user.idCorBordaPerfil || 'gold',
        rank: user.rank || 1,
        isAdmin: !!user.isAdmin,
        hasPremium: !!(user.itensComprados && user.itensComprados.includes('premium-xp')),
        premio: premio,
        posicao: index + 1
      };
    });

    console.log('[LEADERBOARD] Retornando:', usuariosComPremio.length, 'usuários');
    res.json({ ok: true, usuarios: usuariosComPremio });
  } catch (err) {
    console.error('[LEADERBOARD] Erro:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao obter leaderboard: " + err.message });
  }
});

// === LEADERBOARD DE RANK ===
app.get("/leaderboard/rank", async (req, res) => {
  try {
    // Adicionado "xp: 1" na projeção e alterado o sort para ordenar por XP descrescente
    const usuarios = await Usuario.find({}, { 
        nome: 1, 
        moedas: 1, 
        foto_perfil: 1, 
        bio: 1,
        infiniteCoins: 1,
        infiniteSpins: 1,
        lastDailyRewardDate: 1,
        tagPersonalizada: 1, 
        corTagPersonalizada: 1, 
        tipoCorTag: 1, 
        corBordaPerfil: 1, 
        idCorBordaPerfil: 1, 
        tempo_jogo: 1, 
        rank: 1, 
        xp: 1,
        isAdmin: 1,
        itensComprados: 1,
        _id: 0 
      })
      .sort({ xp: -1 }) // <--- Alterado de rank para xp
      .limit(20)
      .lean();

    const usuariosVisiveis = usuarios.filter(user => !user.infiniteCoins && !user.infiniteSpins);

    // Distribuir prêmios baseado no rank de XP
    const usuariosComPremio = usuariosVisiveis.map((user, index) => {
      let premio = 0;
      if (index === 0) premio = 5000;
      else if (index === 1) premio = 3000;
      else if (index === 2) premio = 1000;
      else if (index >= 3 && index <= 19) premio = 500;

      return {
        nome: user.nome,
        moedas: user.moedas || 0,
        tempo_jogo: user.tempo_jogo || 0,
        foto_perfil: user.foto_perfil || '',
        tagPersonalizada: user.tagPersonalizada || '',
        corTagPersonalizada: user.corTagPersonalizada || '#a855f7',
        tipoCorTag: user.tipoCorTag || 'comum',
        corBordaPerfil: user.corBordaPerfil || '#ffd700',
        idCorBordaPerfil: user.idCorBordaPerfil || 'gold',
        rank: user.rank || 1,
        isAdmin: !!user.isAdmin,
        xp: user.xp || 0, // <--- Incluído no retorno para o front-end conseguir exibir
        hasPremium: !!(user.itensComprados && user.itensComprados.includes('premium-xp')),
        premio: premio,
        posicao: index + 1
      };
    });

    console.log('[LEADERBOARD-XP] Retornando:', usuariosComPremio.length, 'usuários');
    res.json({ ok: true, usuarios: usuariosComPremio });
  } catch (err) {
    console.error('[LEADERBOARD-XP] Erro:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao obter leaderboard de XP: " + err.message });
  }
});
// === LEADERBOARD DE MOEDAS ===
app.get("/leaderboard/moedas", async (req, res) => {
  try {
    const usuarios = await Usuario.find({}, { nome: 1, moedas: 1, foto_perfil: 1, bio: 1, infiniteCoins: 1, infiniteSpins: 1, lastDailyRewardDate: 1, tagPersonalizada: 1, corTagPersonalizada: 1, tipoCorTag: 1, corBordaPerfil: 1, idCorBordaPerfil: 1, tempo_jogo: 1, rank: 1, isAdmin: 1, itensComprados: 1, _id: 0 })
      .sort({ moedas: -1 })
      .limit(20)
      .lean();

    const usuariosVisiveis = usuarios.filter(user => !user.infiniteCoins && !user.infiniteSpins);

    // Distribuir prêmios baseado em moedas
    const usuariosComPremio = usuariosVisiveis.map((user, index) => {
      let premio = 0;
      if (index === 0) premio = 5000;
      else if (index === 1) premio = 3000;
      else if (index === 2) premio = 1000;
      else if (index >= 3 && index <= 19) premio = 500;

      return {
        nome: user.nome,
        moedas: user.moedas || 0,
        tempo_jogo: user.tempo_jogo || 0,
        foto_perfil: user.foto_perfil || '',
        tagPersonalizada: user.tagPersonalizada || '',
        corTagPersonalizada: user.corTagPersonalizada || '#a855f7',
        tipoCorTag: user.tipoCorTag || 'comum',
        corBordaPerfil: user.corBordaPerfil || '#ffd700',
        idCorBordaPerfil: user.idCorBordaPerfil || 'gold',
        rank: user.rank || 1,
        isAdmin: !!user.isAdmin,
        hasPremium: !!(user.itensComprados && user.itensComprados.includes('premium-xp')),
        premio: premio,
        posicao: index + 1
      };
    });

    console.log('[LEADERBOARD-MOEDAS] Retornando:', usuariosComPremio.length, 'usuários');
    res.json({ ok: true, usuarios: usuariosComPremio });
  } catch (err) {
    console.error('[LEADERBOARD-MOEDAS] Erro:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao obter leaderboard de moedas: " + err.message });
  }
});

// === LEADERBOARD DE GIROS ===
app.get("/leaderboard/giros", async (req, res) => {
  try {
    const usuarios = await Usuario.find({}, { nome: 1, spins: 1, foto_perfil: 1, bio: 1, infiniteCoins: 1, infiniteSpins: 1, lastDailyRewardDate: 1, tagPersonalizada: 1, corTagPersonalizada: 1, tipoCorTag: 1, corBordaPerfil: 1, idCorBordaPerfil: 1, tempo_jogo: 1, moedas: 1, rank: 1, isAdmin: 1, itensComprados: 1, _id: 0 })
      .sort({ spins: -1 })
      .limit(20)
      .lean();

    const usuariosVisiveis = usuarios.filter(user => !user.infiniteCoins && !user.infiniteSpins);

    // Distribuir prêmios baseado em giros
    const usuariosComPremio = usuariosVisiveis.map((user, index) => {
      let premio = 0;
      if (index === 0) premio = 20;
      else if (index === 1) premio = 15;
      else if (index === 2) premio = 10;
      else if (index >= 3 && index <= 19) premio = 5;

      return {
        nome: user.nome,
        spins: user.spins || 0,
        moedas: user.moedas || 0,
        tempo_jogo: user.tempo_jogo || 0,
        foto_perfil: user.foto_perfil || '',
        tagPersonalizada: user.tagPersonalizada || '',
        corTagPersonalizada: user.corTagPersonalizada || '#a855f7',
        tipoCorTag: user.tipoCorTag || 'comum',
        corBordaPerfil: user.corBordaPerfil || '#ffd700',
        idCorBordaPerfil: user.idCorBordaPerfil || 'gold',
        rank: user.rank || 1,
        isAdmin: !!user.isAdmin,
        hasPremium: !!(user.itensComprados && user.itensComprados.includes('premium-xp')),
        premio: premio,
        posicao: index + 1
      };
    });

    console.log('[LEADERBOARD-GIROS] Retornando:', usuariosComPremio.length, 'usuários');
    res.json({ ok: true, usuarios: usuariosComPremio });
  } catch (err) {
    console.error('[LEADERBOARD-GIROS] Erro:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao obter leaderboard de giros: " + err.message });
  }
});

// === ENDPOINTS DE COMPRAS ===
app.post("/registrar-compra", autenticar, async (req, res) => {
  try {
    const { itemId, itemNome, preco } = req.body;

    // Registrar na coleção de compras (log)
    const novaCompra = new Compra({
      usuario: req.usuario.nome,
      itemId,
      itemNome,
      preco
    });
    await novaCompra.save();

    // Adicionar item ao usuário se ainda não tiver
    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (usuario) {
      if (!usuario.itensComprados.includes(itemId)) {
        usuario.itensComprados.push(itemId);
        await usuario.save();
      }
    }

    res.json({ ok: true, mensagem: "Compra registrada!" });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

app.get("/admin/compras", autenticar, verificarAdmin, async (req, res) => {
  try {
    const compras = await Compra.find({}).sort({ data: -1 }).limit(20);
    res.json({ ok: true, compras });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ENDPOINTS DE TAG PERSONALIZADA ===
app.post("/definir-tag", autenticar, async (req, res) => {
  try {
    const { tag } = req.body;

    if (!tag || tag.length < 1 || tag.length > 10) {
      if (!req.usuario.isAdmin) {
      return res.status(400).json({ ok: false, mensagem: "Tag deve ter entre 1 e 10 caracteres!" });
      }
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    usuario.tagPersonalizada = tag;
    await usuario.save();

    res.json({ ok: true, mensagem: `✅ Tag personalizada definida para: ${tag}` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ENDPOINT PARA OBTER DADOS DO USUÁRIO ===
app.get("/dados-usuario", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.usuario.nome }, { nome: 1, moedas: 1, foto_perfil: 1, bio: 1, infiniteCoins: 1, infiniteSpins: 1, lastDailyRewardDate: 1, tagPersonalizada: 1, corTagPersonalizada: 1, tipoCorTag: 1, tempo_jogo: 1, _id: 0 });

    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    res.json({ 
      ok: true, 
      usuario: {
        nome: usuario.nome,
        moedas: parseInt(usuario.moedas) || 0,
        foto_perfil: usuario.foto_perfil || '',
        bio: usuario.bio || '',
        infiniteCoins: !!usuario.infiniteCoins,
        infiniteSpins: !!usuario.infiniteSpins,
        lastDailyRewardDate: usuario.lastDailyRewardDate || null,
        tagPersonalizada: usuario.tagPersonalizada || '',
        corTagPersonalizada: usuario.corTagPersonalizada || '#a855f7',
        tipoCorTag: usuario.tipoCorTag || 'comum',
        tempo_jogo: parseInt(usuario.tempo_jogo) || 0
      }
    });
  } catch (err) {
    console.error('[DADOS-USUARIO] Erro:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao obter dados do usuário: " + err.message });
  }
});

// === ENDPOINT PARA OBTER ITENS COMPRADOS ===
app.get("/itens-comprados", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.usuario.nome }, { itensComprados: 1, corBordaPerfil: 1, idCorBordaPerfil: 1, _id: 0 });
    
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }
    
    res.json({ 
      ok: true, 
      itens: usuario.itensComprados || [],
      corBordaPerfil: usuario.corBordaPerfil || '#ffd700',
      idCorBordaPerfil: usuario.idCorBordaPerfil || 'gold'
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao obter itens: " + err.message });
  }
});

// === ENDPOINT PARA SINCRONIZAR ITENS E BORDA DO USUÁRIO ===
app.post("/sincronizar-itens", autenticar, async (req, res) => {
  try {
    const { itensComprados, corBordaPerfil, idCorBordaPerfil } = req.body;

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    const listaItens = Array.isArray(itensComprados)
      ? [...new Set(itensComprados.filter(Boolean).map(item => String(item).trim()).filter(Boolean))]
      : [...(usuario.itensComprados || [])];

    usuario.itensComprados = listaItens;

    if (corBordaPerfil !== undefined) {
      usuario.corBordaPerfil = String(corBordaPerfil);
    }

    if (idCorBordaPerfil !== undefined) {
      const escolha = String(idCorBordaPerfil).trim();
      const CORES_MAPEAMENTO = {
        'silver': '#c0c0c0',
        'red': '#ff0000',
        'blue': '#0000ff',
        'green': '#22c55e',
        'orange': '#ff8a00',
        'yellow': '#ffff00',
        'lime': '#00ff00',
        'gold': '#ffd700',
        'purple': '#a855f7',
        'cyan': '#00d4ff',
        'pink': '#ff00cc',
        'lime-glow': '#39ff14',
        'sky-blue': '#87ceeb',
        'rainbow': 'linear-gradient(90deg, #ff0000, #ff8000, #ffff00, #00ff00, #00ffff, #0000ff, #8000ff, #ff0000)'
      };

      if (CORES_MAPEAMENTO[escolha]) {
        usuario.idCorBordaPerfil = escolha;
        usuario.corBordaPerfil = CORES_MAPEAMENTO[escolha];
      }
    }

    await usuario.save();

    res.json({
      ok: true,
      mensagem: "Itens e borda sincronizados com sucesso!",
      itens: usuario.itensComprados || [],
      corBordaPerfil: usuario.corBordaPerfil || '#ffd700',
      idCorBordaPerfil: usuario.idCorBordaPerfil || 'gold'
    });
  } catch (err) {
    console.error('[SYNC-ITENS] Erro ao sincronizar itens:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao sincronizar itens: " + err.message });
  }
});

// === ENDPOINT PARA OBTER E SINCRONIZAR JOGOS SECRETOS ===
app.get("/jogos-secretos", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.usuario.nome }, { jogosSecretos: 1, _id: 0 });
    
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }
    
    res.json({ 
      ok: true, 
      jogosSecretos: usuario.jogosSecretos || []
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao obter jogos secretos: " + err.message });
  }
});

app.post("/jogos-secretos", autenticar, async (req, res) => {
  try {
    const { jogosSecretos } = req.body;
    const lista = Array.isArray(jogosSecretos)
      ? jogosSecretos
          .filter(Boolean)
          .map(item => String(item).trim())
          .filter(Boolean)
      : [];

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    const listaUnica = [...new Set([...(usuario.jogosSecretos || []), ...lista])];
    usuario.jogosSecretos = listaUnica;
    await usuario.save();

    res.json({
      ok: true,
      mensagem: "Jogos secretos sincronizados com sucesso!",
      jogosSecretos: usuario.jogosSecretos || []
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao sincronizar jogos secretos: " + err.message });
  }
});

// === ENDPOINT PARA OBTER ACHIEVEMENTS ===
app.get("/achievements-usuario", autenticar, async (req, res) => {
  try {
    const backup = await Backup.findOne({ usuario: req.usuario.nome }, { "dados.achievements": 1, _id: 0 });
    
    if (!backup || !backup.dados) {
      return res.json({ 
        ok: true, 
        achievements: []
      });
    }
    
    res.json({ 
      ok: true, 
      achievements: backup.dados.achievements || []
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao obter achievements: " + err.message });
  }
});

const RANK_THRESHOLDS = [
  0,
  100,
  500,
  1500,
  3700,
  7100,
  12300,
  20000,
  29000,
  41000,
  57000,
  76000,
  98000,
  125000,
  156000,
  192000,
  233000,
  280000,
  332000,
  390000,
  455000,
  527000,
  606000,
  692000,
  787000,
  889000,
  1000000,
  1122000,
  1255000,
  1400000,
  2000000
];

const RANK_MAXIMO = 31;

function calcularRankEProgressaoXP(xpAtual, rankAtual) {
  const rankInformado = Math.max(1, Number(rankAtual) || 1);
  let xp = Math.max(0, Number(xpAtual) || 0);

  if (rankInformado > 1) {
    const thresholdAtual = RANK_THRESHOLDS[rankInformado - 1] || 0;
    if (xp < thresholdAtual) {
      xp += thresholdAtual;
    }
  }

  let rank = 1;
  for (let rankCandidate = 2; rankCandidate <= RANK_MAXIMO; rankCandidate++) {
    if (xp >= RANK_THRESHOLDS[rankCandidate - 1]) {
      rank = rankCandidate;
    }
  }

  if (rank >= RANK_MAXIMO) {
    return { rank: RANK_MAXIMO, xp };
  }

  return { rank, xp };
}

// === ENDPOINT PARA OBTER RANK E XP ===
app.get("/rank-xp", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.usuario.nome }, { rank: 1, xp: 1, premiumXp: 1, _id: 0 });

    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    const progresso = calcularRankEProgressaoXP(usuario.xp || 0, usuario.rank || 1);

    if (usuario.rank !== progresso.rank || usuario.xp !== progresso.xp) {
      usuario.rank = progresso.rank;
      usuario.xp = progresso.xp;
      await usuario.save();
    }

    res.json({
      ok: true,
      rank: progresso.rank,
      xp: progresso.xp,
      premium: usuario.premiumXp || false
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao obter rank: " + err.message });
  }
});

// === ENDPOINT PARA ATUALIZAR XP ===
app.post("/atualizar-xp", autenticar, async (req, res) => {
  try {
    const { quantidade } = req.body;
    const quantidadeInt = normalizarInteiro(quantidade);

    if (!Number.isInteger(quantidade) || quantidadeInt <= 0 || quantidadeInt > MAX_XP_AUMENTO) {
      return res.status(400).json({ ok: false, mensagem: "Quantidade de XP inválida ou muito alta!" });
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    let multiplicador = 1;

if (usuario.itensComprados.includes('premium-xp')) {
    multiplicador *= 2;
}
if (usuario.itensComprados.includes('ultra-xp')) {
    multiplicador *= 4;
}

let xpGanho = quantidadeInt * multiplicador;

    const estadoAtual = calcularRankEProgressaoXP(usuario.xp || 0, usuario.rank || 1);
    const progresso = calcularRankEProgressaoXP(estadoAtual.xp + xpGanho, estadoAtual.rank || 1);
    usuario.rank = progresso.rank;
    usuario.xp = progresso.xp;

    await usuario.save();

    res.json({ 
      ok: true, 
      rank: usuario.rank,
      xp: usuario.xp,
      xpGanho: xpGanho,
      premium: usuario.premiumXp,
      mensagem: `XP atualizado! Rank: ${usuario.rank}/30${usuario.premiumXp ? ' [2x Premium]' : ''}`
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao atualizar XP: " + err.message });
  }
});

// === ENDPOINT PARA ATIVAR PREMIUM XP ===
app.post("/ativar-premium", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    if (usuario.premiumXp) {
      return res.json({ ok: true, mensagem: "Você já possui Premium XP!", premium: true });
    }

    usuario.premiumXp = true;
    await usuario.save();

    console.log(`[PREMIUM] ${req.usuario.nome} ativou Premium XP`);
    res.json({ 
      ok: true, 
      premium: true,
      mensagem: "✨ Premium XP ativado! Você ganha 2x XP a partir de agora!" 
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao ativar Premium: " + err.message });
  }
});

// === ENDPOINT PARA SINCRONIZAR MOEDAS ===
app.post("/sincronizar-moedas", autenticar, async (req, res) => {
  try {
    const { moedas } = req.body;

    const moedAsInt = normalizarInteiro(moedas);
    if (isNaN(Number(moedas)) || moedAsInt < 0) {
      console.error(`[SYNC] Valor de moedas inválido: ${moedas}`);
      return res.status(400).json({ ok: false, mensagem: "Valor de moedas inválido!" });
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      console.error(`[SYNC] Usuário não encontrado: ${req.usuario.nome}`);
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    const validacao = validarDelta(moedAsInt, usuario.moedas || 0, MAX_MOEDAS_AUMENTO, "moedas");
    if (!validacao.ok) {
      console.warn(`[SYNC] Bloqueado para ${req.usuario.nome}: ${validacao.mensagem}`);
      return res.status(400).json({ ok: false, mensagem: validacao.mensagem });
    }
    
    // Verifica se tem o ultra premium
    
    if (req.usuario.itensComprados.includes('ultra-xp')) {
      usuario.moedas = moedAsInt * 2;
    } else {
      usuario.moedas = moedAsInt;
    }
    
    await usuario.save();

    console.log(`[SYNC] ✅ Moedas sincronizadas para ${req.usuario.nome}: ${moedAsInt}`);
    res.json({ 
      ok: true, 
      mensagem: "Moedas sincronizadas com sucesso!", 
      moedas: usuario.moedas 
    });
  } catch (err) {
    console.error('[SYNC] Erro ao sincronizar moedas:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao sincronizar moedas: " + err.message });
  }
});

// === ENDPOINT PARA SINCRONIZAR DADOS SIMPLES ===
app.post("/sincronizar-dados-simples", autenticar, async (req, res) => {
  try {
    const { moedas, playtime, tag, tagColor, tagColorType, fotoPerfil, bio, lastDailyRewardDate, infiniteCoins, infiniteSpins } = req.body;

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    // Sincronizar cada campo se fornecido
    if (moedas !== undefined) {
      const moedasInt = normalizarInteiro(moedas);
      if (isNaN(Number(moedas)) || moedasInt < 0) {
        return res.status(400).json({ ok: false, mensagem: "Valor de moedas inválido!" });
      }
      const validacaoMoedas = validarDelta(moedasInt, usuario.moedas || 0, MAX_MOEDAS_AUMENTO, "moedas");
      if (!validacaoMoedas.ok) {
        return res.status(400).json({ ok: false, mensagem: validacaoMoedas.mensagem });
      }

      if (req.usuario.itensComprados.includes('ultra-xp')) {
       usuario.moedas = moedAsInt * 2;
      } else {
       usuario.moedas = moedAsInt;
      }
    }
    if (playtime !== undefined) {
      const playtimeInt = normalizarInteiro(playtime);
      if (isNaN(Number(playtime)) || playtimeInt < 0) {
        return res.status(400).json({ ok: false, mensagem: "Tempo de jogo inválido!" });
      }
      const validacaoTempo = validarDelta(playtimeInt, usuario.tempo_jogo || 0, MAX_TEMPO_JOGO_AUMENTO, "tempo de jogo");
      if (!validacaoTempo.ok) {
        return res.status(400).json({ ok: false, mensagem: validacaoTempo.mensagem });
      }
      usuario.tempo_jogo = playtimeInt;
    }
    if (tag !== undefined) {
      usuario.tagPersonalizada = tag;
    }
    if (tagColor !== undefined) {
      usuario.corTagPersonalizada = tagColor;
    }
    if (tagColorType !== undefined) {
      usuario.tipoCorTag = tagColorType;
    }
    if (fotoPerfil !== undefined) {
      usuario.foto_perfil = fotoPerfil;
    }
    if (bio !== undefined) {
      usuario.bio = String(bio).slice(0, 500);
    }
    if (lastDailyRewardDate !== undefined) {
      usuario.lastDailyRewardDate = lastDailyRewardDate || null;
    }
    if (infiniteCoins !== undefined) {
      usuario.infiniteCoins = Boolean(infiniteCoins);
    }
    if (infiniteSpins !== undefined) {
      usuario.infiniteSpins = Boolean(infiniteSpins);
    }

    await usuario.save();

    console.log(`[SYNC-SIMPLES] ✅ Dados sincronizados para ${req.usuario.nome}`);
    res.json({ 
      ok: true, 
      mensagem: "Dados sincronizados com sucesso!",
      usuario: {
        moedas: usuario.moedas,
        tempo_jogo: usuario.tempo_jogo,
        tagPersonalizada: usuario.tagPersonalizada,
        corTagPersonalizada: usuario.corTagPersonalizada,
        tipoCorTag: usuario.tipoCorTag,
        foto_perfil: usuario.foto_perfil,
        bio: usuario.bio || '',
        infiniteCoins: !!usuario.infiniteCoins,
        infiniteSpins: !!usuario.infiniteSpins,
        lastDailyRewardDate: usuario.lastDailyRewardDate || null
      }
    });
  } catch (err) {
    console.error('[SYNC-SIMPLES] Erro ao sincronizar dados:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao sincronizar dados: " + err.message });
  }
});

// === ENDPOINT PARA CARREGAR DADOS SIMPLES DO SERVIDOR ===
app.get("/carregar-dados-simples", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    console.log(`[LOAD-SIMPLES] ✅ Dados carregados para ${req.usuario.nome}`);
    res.json({
      ok: true,
      dados: {
        moedas: usuario.moedas,
        playtime: usuario.tempo_jogo,
        tag: usuario.tagPersonalizada,
        tagColor: usuario.corTagPersonalizada,
        tagColorType: usuario.tipoCorTag,
        fotoPerfil: usuario.foto_perfil,
        bio: usuario.bio || '',
        infiniteCoins: !!usuario.infiniteCoins,
        infiniteSpins: !!usuario.infiniteSpins,
        lastDailyRewardDate: usuario.lastDailyRewardDate || null
      }
    });
  } catch (err) {
    console.error('[LOAD-SIMPLES] Erro ao carregar dados:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao carregar dados: " + err.message });
  }
});

// === ADMIN: ADICIONAR LOOTBOXES ===
app.post("/admin/adicionar-lootbox", autenticar, verificarAdmin, async (req, res) => {
  try {
    const { nomeUsuario, tipo, quantidade } = req.body;

    if (!['comum', 'rara', 'epica', 'lendaria'].includes(tipo)) {
      return res.status(400).json({ ok: false, mensagem: "Tipo de lootbox inválido!" });
    }

    if (typeof quantidade !== 'number' || quantidade <= 0) {
      return res.status(400).json({ ok: false, mensagem: "Quantidade deve ser um número positivo!" });
    }

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    if (!usuario.lootboxes) {
      usuario.lootboxes = { comum: 0, rara: 0, epica: 0, lendaria: 0 };
    }

    usuario.lootboxes[tipo] = (usuario.lootboxes[tipo] || 0) + quantidade;
    await usuario.save();

    console.log(`[LOOTBOX-ADMIN] Admin adicionou ${quantidade}x lootbox ${tipo} a ${nomeUsuario}`);
    res.json({ ok: true, mensagem: `✅ ${quantidade}x Lootbox ${tipo} adicionada(s) a ${nomeUsuario}!`, novaQuantidade: usuario.lootboxes[tipo] });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ENDPOINT PARA VER LOOTBOXES DO USUÁRIO ===
app.get("/minhas-lootboxes", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.usuario.nome }, { lootboxes: 1, _id: 0 });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    res.json({ 
      ok: true, 
      lootboxes: usuario.lootboxes || { comum: 0, rara: 0, epica: 0, lendaria: 0 }
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ENDPOINTS DE COR DE TAG ===
app.post("/definir-cor-tag", autenticar, async (req, res) => {
  try {
    const { cor, tipo } = req.body;

    if (!cor || !tipo || !['comum', 'especial'].includes(tipo)) {
      return res.status(400).json({ ok: false, mensagem: "Cor ou tipo inválido!" });
    }

    // Verificar se o usuário tem permissão para usar este tipo de cor
    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    if (tipo === 'especial' && !usuario.itensComprados.includes('cor-especial')) {
      return res.status(403).json({ ok: false, mensagem: "Você não possui a cor especial!" });
    }

    if (tipo === 'comum' && !usuario.itensComprados.includes('cor-comum')) {
      return res.status(403).json({ ok: false, mensagem: "Você não possui a cor comum!" });
    }

    usuario.corTagPersonalizada = cor;
    usuario.tipoCorTag = tipo;
    await usuario.save();

    console.log(`[TAG-COLOR] Cor da tag atualizada para ${req.usuario.nome}: ${cor} (${tipo})`);
    res.json({ ok: true, mensagem: "Cor da tag atualizada com sucesso!" });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao definir cor da tag: " + err.message });
  }
});

// === ENDPOINT PARA ATUALIZAR FOTO DE PERFIL ===
app.post("/atualizar-foto-perfil", autenticar, async (req, res) => {
  try {
    const { foto_perfil } = req.body;

    if (!foto_perfil || foto_perfil.length === 0) {
      return res.status(400).json({ ok: false, mensagem: "Foto inválida!" });
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    usuario.foto_perfil = foto_perfil;
    await usuario.save();

    console.log(`[PHOTO] Foto de perfil atualizada para ${req.usuario.nome}`);
    res.json({ ok: true, mensagem: "Foto de perfil atualizada!", foto_perfil: usuario.foto_perfil });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao atualizar foto: " + err.message });
  }
});

// === ENDPOINT PARA ATUALIZAR TEMPO DE JOGO ===
app.post("/atualizar-tempo-jogo", autenticar, async (req, res) => {
  try {
    const { minutos } = req.body;
    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    usuario.tempo_jogo = (usuario.tempo_jogo || 0) + minutos;
    await usuario.save();
    res.json({ ok: true, mensagem: "Tempo atualizado!" });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ENDPOINTS DO SISTEMA DE ROLETA ===
// Obter giros do usuário
app.get("/user/spins", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.usuario.nome }, { spins: 1, _id: 0 });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    res.json({ ok: true, spins: usuario.spins || 0 });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao obter giros: " + err.message });
  }
});

// Atualizar giros do usuário
app.put("/user/spins", autenticar, async (req, res) => {
  try {
    const { spins } = req.body;
    const spinsInt = normalizarInteiro(spins);

    if (typeof spins !== 'number' && typeof spins !== 'string' || spinsInt < 0) {
      return res.status(400).json({ ok: false, mensagem: "Valor de spins inválido!" });
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    const validacao = validarDelta(spinsInt, usuario.spins || 0, MAX_SPINS_AUMENTO, "giros");
    if (!validacao.ok) {
      return res.status(400).json({ ok: false, mensagem: validacao.mensagem });
    }

    usuario.spins = spinsInt;
    await usuario.save();

    console.log(`[SPINS] ${req.usuario.nome} agora tem ${spinsInt} giros`);
    res.json({ ok: true, spins: usuario.spins });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao atualizar spins: " + err.message });
  }
});

// Adicionar giros a um usuário (apenas Dogue)
app.post("/admin/adicionar-giros", autenticar, async (req, res) => {
  try {
    // Apenas Dogue pode usar
    if (req.usuario.nome !== "Dogue") {
      return res.status(403).json({ ok: false, mensagem: "❌ Apenas Dogue pode adicionar giros!" });
    }

    const { nomeUsuario, quantidade } = req.body;

    if (typeof quantidade !== 'number' || quantidade <= 0) {
      return res.status(400).json({ ok: false, mensagem: "Quantidade deve ser um número positivo!" });
    }

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    usuario.spins = (usuario.spins || 0) + quantidade;
    await usuario.save();

    console.log(`[GIROS-ADMIN] Dogue adicionou ${quantidade} giros a ${nomeUsuario}`);
    res.json({ ok: true, mensagem: `✅ ${quantidade} giro(s) adicionado(s) a ${nomeUsuario}!`, novosGiros: usuario.spins });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Adicionar tempo de jogo a um usuário (apenas Dogue)
app.post("/admin/adicionar-tempo-jogo", autenticar, async (req, res) => {
  try {
    // Apenas Dogue pode usar
    if (req.usuario.nome !== "Dogue") {
      return res.status(403).json({ ok: false, mensagem: "❌ Apenas Dogue pode adicionar tempo de jogo!" });
    }

    const { nomeUsuario, minutos } = req.body;

    if (typeof minutos !== 'number' || minutos <= 0) {
      return res.status(400).json({ ok: false, mensagem: "Tempo deve ser um número positivo (em minutos)!" });
    }

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    usuario.tempo_jogo = (usuario.tempo_jogo || 0) + minutos;
    await usuario.save();

    console.log(`[TEMPO-ADMIN] Dogue adicionou ${minutos} minutos a ${nomeUsuario}`);
    res.json({ ok: true, mensagem: `✅ ${minutos} minuto(s) de tempo de jogo adicionado(s) a ${nomeUsuario}!`, novoTempo: usuario.tempo_jogo });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});


// === ENDPOINT PARA MUDAR COR DA BORDA DO PERFIL ===
app.post("/mudar-cor-borda", autenticar, async (req, res) => {
  try {
    const { corId } = req.body;

    if (!corId) {
      return res.status(400).json({ ok: false, mensagem: "ID da cor inválido!" });
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    // Verificar se o usuário possui a cor desbloqueada
    if (!usuario.itensComprados.includes(`cor-${corId}`)) {
      return res.status(403).json({ ok: false, mensagem: "Você não possui essa cor de borda desbloqueada!" });
    }

    // Mapeamento de cores
    const CORES_MAPEAMENTO = {
      'silver': '#c0c0c0',
      'red': '#ff0000',
      'blue': '#0000ff',
      'green': '#22c55e',
      'orange': '#ff8a00',
      'yellow': '#ffff00',
      'lime': '#00ff00',
      'gold': '#ffd700',
      'purple': '#a855f7',
      'cyan': '#00d4ff',
      'pink': '#ff00cc',
      'lime-glow': '#39ff14',
      'sky-blue': '#87ceeb',
      'rainbow': 'linear-gradient(90deg, #ff0000, #ff8000, #ffff00, #00ff00, #00ffff, #0000ff, #8000ff, #ff0000)'
    };

    const corValue = CORES_MAPEAMENTO[corId];
    if (!corValue) {
      return res.status(400).json({ ok: false, mensagem: "Cor desconhecida!" });
    }

    usuario.corBordaPerfil = corValue;
    usuario.idCorBordaPerfil = corId;
    await usuario.save();

    console.log(`[BORDA-COLOR] ${req.usuario.nome} alterou cor da borda para: ${corId}`);
    res.json({ ok: true, mensagem: `✅ Cor da borda alterada para ${corId}!`, corBordaPerfil: corValue });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

app.get("/dadosSecretos", autenticar, (req, res) => {
  res.send(`Bem-vindo, ${req.usuario.nome}! Aqui estão seus dados secretos.`);
});

// === SISTEMA DE LOOTBOX ===
const LOOTBOX_CONFIG = {
  comum: {
    price: 100,
    rewards: [
      { type: 'moedas', amount: 100, chance: 0.50 },
      { type: 'moedas', amount: 200, chance: 0.30 },
      { type: 'moedas', amount: 50, chance: 0.20 }
    ]
  },
  rara: {
    price: 500,
    rewards: [
      { type: 'moedas', amount: 500, chance: 0.30 },
      { type: 'moedas', amount: 1000, chance: 0.25 },
      { type: 'moedas', amount: 250, chance: 0.10 },
      { type: 'item', itemId: 'cor-blue', name: 'Cor Azul', chance: 0.10 },
      { type: 'item', itemId: 'cor-red', name: 'Cor Vermelho', chance: 0.08 },
      { type: 'item', itemId: 'cor-green', name: 'Cor Verde', chance: 0.08 },
      { type: 'item', itemId: 'cor-orange', name: 'Cor Laranja', chance: 0.09 }
    ]
  },
  epica: {
    price: 1500,
    rewards: [
      { type: 'moedas', amount: 2000, chance: 0.25 },
      { type: 'moedas', amount: 3000, chance: 0.20 },
      { type: 'moedas', amount: 1500, chance: 0.10 },
      { type: 'item', itemId: 'cor-purple', name: 'Cor Roxa Neon', chance: 0.12 },
      { type: 'item', itemId: 'cor-cyan', name: 'Cor Ciano', chance: 0.12 },
      { type: 'item', itemId: 'cor-pink', name: 'Cor Rosa Néon', chance: 0.11 },
      { type: 'item', itemId: 'cor-gold', name: 'Cor Dourada', chance: 0.10 }
    ]
  },
  lendaria: {
    price: 5000,
    rewards: [
      { type: 'moedas', amount: 5000, chance: 0.20 },
      { type: 'moedas', amount: 7500, chance: 0.15 },
      { type: 'moedas', amount: 10000, chance: 0.10 },
      { type: 'item', itemId: 'cor-lime-glow', name: 'Cor Verde Neon', chance: 0.12 },
      { type: 'item', itemId: 'cor-sky-blue', name: 'Cor Azul Céu', chance: 0.12 },
      { type: 'item', itemId: 'cor-gold', name: 'Cor Dourada Premium', chance: 0.11 },
      { type: 'item', itemId: 'cor-rainbow', name: '🌈 Arco-Iris (RARA)', chance: 0.20 }
    ]
  }
};

function getRandomReward(rewards) {
  const random = Math.random();
  let accumulated = 0;

  for (const reward of rewards) {
    accumulated += reward.chance;
    if (random < accumulated) {
      return reward;
    }
  }

  // Retorna o último reward se nenhum foi encontrado (edge case)
  return rewards[rewards.length - 1];
}

// === COMPRAR LOOTBOX ===
app.post("/comprar-lootbox", autenticar, async (req, res) => {
  try {
    const { type } = req.body;
    const lootbox = LOOTBOX_CONFIG[type];

    if (!lootbox) {
      return res.status(400).json({ ok: false, mensagem: "Tipo de lootbox inválido!" });
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    // Verificar moedas
    if (usuario.moedas < lootbox.price) {
      return res.status(400).json({ ok: false, mensagem: `❌ Você precisa de ${lootbox.price} moedas!` });
    }

    // Remover moedas
    usuario.moedas -= lootbox.price;

    // Adicionar lootbox
    if (!usuario.lootboxes) {
      usuario.lootboxes = { comum: 0, rara: 0, epica: 0, lendaria: 0 };
    }
    usuario.lootboxes[type] = (usuario.lootboxes[type] || 0) + 1;

    // Registrar compra
    const novaCompra = new Compra({
      usuario: req.usuario.nome,
      itemId: `lootbox-${type}`,
      itemNome: `Lootbox ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      preco: lootbox.price
    });
    await novaCompra.save();

    await usuario.save();

    console.log(`[LOOTBOX-COMPRA] ${req.usuario.nome} comprou 1x lootbox ${type}`);

    res.json({ 
      ok: true, 
      mensagem: `✅ Lootbox ${type} comprada!`,
      novoSaldo: usuario.moedas,
      quantidade: usuario.lootboxes[type]
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ABRIR LOOTBOX ===
app.post("/lootbox/abrir", autenticar, async (req, res) => {
  try {
    const { type } = req.body;
    const lootbox = LOOTBOX_CONFIG[type];

    if (!lootbox) {
      return res.status(400).json({ ok: false, mensagem: "Tipo de lootbox inválido!" });
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    // Verificar se possui lootbox
    if (!usuario.lootboxes || !usuario.lootboxes[type] || usuario.lootboxes[type] <= 0) {
      return res.status(400).json({ ok: false, mensagem: `❌ Você não possui lootbox ${type}!` });
    }

    // Remover lootbox
    usuario.lootboxes[type] -= 1;

    // Selecionar recompensa aleatória
    const reward = getRandomReward(lootbox.rewards);

    // Aplicar recompensa
    if (reward.type === 'moedas') {
      usuario.moedas += reward.amount;
    } else if (reward.type === 'item') {
      if (!usuario.itensComprados.includes(reward.itemId)) {
        usuario.itensComprados.push(reward.itemId);
      }
    }

    await usuario.save();

    console.log(`[LOOTBOX] ${req.usuario.nome} abriu lootbox ${type} e ganhou:`, reward);

    res.json({ 
      ok: true, 
      mensagem: "Lootbox aberta!",
      reward: reward,
      novoSaldo: usuario.moedas,
      restantes: usuario.lootboxes[type]
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === SISTEMA DE CHAT ===

// Obter mensagens globais (últimas 50)
app.get("/chat/mensagens-globais", async (req, res) => {
  try {
    const mensagens = await MensagemGlobal.find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    // Reverter para ordem cronológica
    const mensagensOrdenadas = mensagens.reverse();

    const nomesUsuarios = [...new Set(mensagensOrdenadas.map(msg => msg.usuario))];
    const usuarios = await Usuario.find({ nome: { $in: nomesUsuarios } }, { nome: 1, isAdmin: 1 }).lean();
    const usuarioMap = usuarios.reduce((map, user) => {
      map[user.nome] = user;
      return map;
    }, {});

    const mensagensComBadge = mensagensOrdenadas.map(msg => ({
      ...msg,
      isAdmin: usuarioMap[msg.usuario]?.isAdmin || false
    }));

    console.log(`[CHAT-GLOBAL] Retornando ${mensagensComBadge.length} mensagens`);
    res.json({ ok: true, mensagens: mensagensComBadge });
  } catch (err) {
    console.error('[CHAT-GLOBAL] Erro:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao obter mensagens: " + err.message });
  }
});

// Enviar mensagem global (requer autenticação)
app.post("/chat/enviar-global", autenticar, async (req, res) => {
  try {
    const { mensagem } = req.body;

    if (!mensagem || mensagem.trim().length === 0) {
      return res.status(400).json({ ok: false, mensagem: "Mensagem vazia!" });
    }

    if (mensagem.length > 500) {
      return res.status(400).json({ ok: false, mensagem: "Mensagem muito longa (máx: 500 caracteres)!" });
    }


    const novaMensagem = new MensagemGlobal({
      usuario: req.usuario.nome,
      mensagem: mensagem.trim(),
      timestamp: new Date()
    });

    await novaMensagem.save();

    console.log(`[CHAT-GLOBAL] ${req.usuario.nome}: ${mensagem.substring(0, 50)}...`);

    res.json({ 
      ok: true, 
      mensagem: "Mensagem enviada!",
      dados: novaMensagem 
    });
  } catch (err) {
    console.error('[CHAT-GLOBAL] Erro ao enviar:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao enviar mensagem: " + err.message });
  }
});

// Enviar mensagem privada
app.post("/chat/enviar-privada", autenticar, async (req, res) => {
  try {
    const { destinatario, mensagem } = req.body;

    if (!destinatario || destinatario.trim().length === 0) {
      return res.status(400).json({ ok: false, mensagem: "Destinatário inválido!" });
    }

    if (!mensagem || mensagem.trim().length === 0) {
      return res.status(400).json({ ok: false, mensagem: "Mensagem vazia!" });
    }

    if (mensagem.length > 500) {
      return res.status(400).json({ ok: false, mensagem: "Mensagem muito longa (máx: 500 caracteres)!" });
    }

    // Verificar se o destinatário existe
    const usuarioDestino = await Usuario.findOne({ nome: destinatario });
    if (!usuarioDestino) {
      return res.status(404).json({ ok: false, mensagem: "Usuário destinatário não encontrado!" });
    }

    // Não permitir enviar para si mesmo
    if (req.usuario.nome === destinatario) {
      return res.status(400).json({ ok: false, mensagem: "Você não pode enviar mensagens para si mesmo!" });
    }

    const novaMensagem = new MensagemPrivada({
      remetente: req.usuario.nome,
      destinatario: destinatario,
      mensagem: mensagem.trim(),
      lida: false,
      timestamp: new Date()
    });

    await novaMensagem.save();

    console.log(`[CHAT-PRIVADO] ${req.usuario.nome} -> ${destinatario}: ${mensagem.substring(0, 50)}...`);

    res.json({ 
      ok: true, 
      mensagem: "Mensagem privada enviada!",
      dados: novaMensagem 
    });
  } catch (err) {
    console.error('[CHAT-PRIVADO] Erro ao enviar:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao enviar mensagem: " + err.message });
  }
});

// Obter conversas privadas do usuário
app.get("/chat/conversas-privadas", autenticar, async (req, res) => {
  try {
    // Encontrar todas as conversas (remetente ou destinatário)
    const conversas = await MensagemPrivada.find({
      $or: [
        { remetente: req.usuario.nome },
        { destinatario: req.usuario.nome }
      ]
    }).sort({ timestamp: -1 }).lean();

    // Agrupar por usuário
    const conversasAgrupadas = {};

    conversas.forEach(msg => {
      const ousuario = msg.remetente === req.usuario.nome ? msg.destinatario : msg.remetente;
      
      if (!conversasAgrupadas[ousuario]) {
        conversasAgrupadas[ousuario] = {
          usuario: ousuario,
          ultimaMensagem: msg.mensagem,
          timestamp: msg.timestamp,
          naoLidas: 0
        };
      }

      // Contar mensagens não lidas recebidas
      if (msg.destinatario === req.usuario.nome && !msg.lida) {
        conversasAgrupadas[ousuario].naoLidas += 1;
      }
    });

    // Converter para array e ordenar por timestamp
    const conversasArray = Object.values(conversasAgrupadas)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    console.log(`[CHAT] ${req.usuario.nome} tem ${conversasArray.length} conversas`);

    res.json({ 
      ok: true, 
      conversas: conversasArray,
      total: conversasArray.length
    });
  } catch (err) {
    console.error('[CHAT] Erro ao obter conversas:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao obter conversas: " + err.message });
  }
});

// Obter histórico de conversa privada com um usuário específico
app.get("/chat/conversa-privada/:usuario", autenticar, async (req, res) => {
  try {
    const { usuario } = req.params;

    const mensagens = await MensagemPrivada.find({
      $or: [
        { remetente: req.usuario.nome, destinatario: usuario },
        { remetente: usuario, destinatario: req.usuario.nome }
      ]
    }).sort({ timestamp: 1 }).lean();

    const nomesEnvolvidos = [...new Set(mensagens.map(msg => msg.remetente))];
    const usuarios = await Usuario.find({ nome: { $in: nomesEnvolvidos } }, { nome: 1, isAdmin: 1 }).lean();
    const usuarioMap = usuarios.reduce((map, user) => {
      map[user.nome] = user;
      return map;
    }, {});

    const mensagensComBadge = mensagens.map(msg => ({
      ...msg,
      remetenteIsAdmin: usuarioMap[msg.remetente]?.isAdmin || false
    }));

    // Marcar como lidas as mensagens recebidas
    await MensagemPrivada.updateMany(
      {
        remetente: usuario,
        destinatario: req.usuario.nome,
        lida: false
      },
      { lida: true }
    );

    console.log(`[CHAT] ${req.usuario.nome} abriu conversa com ${usuario} (${mensagensComBadge.length} mensagens)`);

    res.json({ 
      ok: true, 
      mensagens: mensagensComBadge,
      total: mensagensComBadge.length
    });
  } catch (err) {
    console.error('[CHAT] Erro ao obter conversa:', err);
    res.status(500).json({ ok: false, mensagem: "Erro ao obter conversa: " + err.message });
  }
});

// Contar mensagens privadas não lidas
app.get("/chat/nao-lidas", autenticar, async (req, res) => {
  try {
    const count = await MensagemPrivada.countDocuments({
      destinatario: req.usuario.nome,
      lida: false
    });

    res.json({ 
      ok: true, 
      naoLidas: count,
      temNotificacoes: count > 0
    });
  } catch (err) {
    console.error('[CHAT] Erro ao contar não lidas:', err);
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Deletar conversa privada (soft delete - não recomendado para chat)
app.delete("/chat/conversa-privada/:usuario", autenticar, async (req, res) => {
  try {
    const { usuario } = req.params;

    // Simplesmente retorna sucesso, mas em produção seria melhor não deletar
    console.log(`[CHAT] ${req.usuario.nome} solicitou delete de conversa com ${usuario}`);

    res.json({ 
      ok: true, 
      mensagem: "Operação realizada (histórico mantido no servidor)" 
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Listar usuários online (todos os usuários existentes)
app.get("/chat/usuarios-online", async (req, res) => {
  try {
    const usuarios = await Usuario.find({}, { nome: 1, foto_perfil: 1, tagPersonalizada: 1, _id: 0 })
      .limit(50)
      .lean();

    res.json({ 
      ok: true, 
      usuarios: usuarios,
      total: usuarios.length
    });
  } catch (err) {
    console.error('[CHAT] Erro ao listar usuários:', err);
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === MIGRAÇÃO: Corrigir XP de todos os usuários (apenas Dogue) ===
app.post("/admin/migrar-xp-fix", autenticar, verificarDogue, async (req, res) => {
  try {
      // Apenas Dogue pode usar
    if (req.usuario.nome !== "Dogue") {
      return res.status(403).json({ ok: false, mensagem: "❌ Apenas Dogue pode fazer isso!" });
    }
    const usuarios = await Usuario.find({});
    let corrigidos = 0;
    let erros = 0;

    for (const usuario of usuarios) {
      try {
        const progresso = calcularRankEProgressaoXP(usuario.xp || 0, usuario.rank || 1);

        if (usuario.rank !== progresso.rank || usuario.xp !== progresso.xp) {
          usuario.rank = progresso.rank;
          usuario.xp = Math.max(0, progresso.xp); // Nunca negativo
          await usuario.save();
          corrigidos++;
          
          console.log(`[MIGRAÇÃO] ${usuario.nome}: Rank ${usuario.rank} com XP ${usuario.xp}`);
        }
      } catch (err) {
        console.error(`[MIGRAÇÃO-ERRO] ${usuario.nome}:`, err.message);
        erros++;
      }
    }

    res.json({
      ok: true,
      mensagem: `✅ Migração concluída!`,
      corrigidos: corrigidos,
      erros: erros,
      total: usuarios.length
    });

    console.log(`[MIGRAÇÃO] Completada: ${corrigidos} usuários corrigidos, ${erros} erros`);
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro na migração: " + err.message });
  }
});

// === ADMIN: Mudar XP e Rank de um usuário (apenas Dogue) ===
app.post("/admin/mudar-xp-rank", autenticar, verificarDogue, async (req, res) => {
  try {

       // Apenas Dogue pode usar
    if (req.usuario.nome !== "Dogue") {
      return res.status(403).json({ ok: false, mensagem: "❌ Apenas Dogue pode fazer isso!" });
    }

    const { nomeUsuario, novoRank, novoXp } = req.body;

    if (!nomeUsuario) {
      return res.status(400).json({ ok: false, mensagem: "Nome do usuário inválido!" });
    }

    const novoRankNum = parseInt(novoRank);
    const novoXpNum = parseInt(novoXp);

    if (isNaN(novoRankNum) || novoRankNum < 1) {
      return res.status(400).json({ ok: false, mensagem: "Rank deve ser maior que 1" });
    }

    if (isNaN(novoXpNum) || novoXpNum < 0) {
      return res.status(400).json({ ok: false, mensagem: "XP deve ser um número positivo!" });
    }

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    const rankAnterior = usuario.rank;
    const xpAnterior = usuario.xp;

    usuario.rank = novoRankNum;
    usuario.xp = novoXpNum;
    await usuario.save();

    console.log(`[XP-RANK-ADMIN] Dogue alterou ${nomeUsuario}: Rank ${rankAnterior}->${novoRankNum}, XP ${xpAnterior}->${novoXpNum}`);

    res.json({
      ok: true,
      mensagem: `✅ Rank e XP de ${nomeUsuario} alterados com sucesso!`,
      usuarioAtualizado: {
        nome: usuario.nome,
        rankAnterior: rankAnterior,
        rankNovo: usuario.rank,
        xpAnterior: xpAnterior,
        xpNovo: usuario.xp
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao alterar XP/Rank: " + err.message });
  }
});

// Rota de pagamento integrando com Mercado Pago
app.post('/api/pagamento', async (req, res) => {
  const { user, email, amount, method, items } = req.body || {};

  if (!amount || !method) return res.status(400).json({ message: 'Parâmetros inválidos: amount e method são obrigatórios.' });

  try {
    if (!MP_TOKEN) return res.status(500).json({ message: 'Token do Mercado Pago não configurado no servidor.' });

    // Fluxo PIX
    if (method === 'pix') {
     // Exemplo de como incluir no payload do PIX / Boleto:
const paymentData = {
  transaction_amount: Number(amount),
  description: descricaoCompra,
  payment_method_id: 'pix',
  payer: {
    email: email,
    first_name: user
  },
  // Metadados lidos pelo Webhook após aprovação
  metadata: {
    usuario: user,
    items: items
  }
};

      const response = await mercadopago.payment.create(paymentData);
      const body = response && response.body ? response.body : response;
      const txn = (body.point_of_interaction && body.point_of_interaction.transaction_data) ? body.point_of_interaction.transaction_data : {};

      // Registra compra no banco (rastreio)
      try {
        const compra = new Compra({ usuario: user || 'guest', itemId: (items && items[0] && items[0].id) || 'unknown', itemNome: paymentData.description, preco: Number(amount) });
        await compra.save();
      } catch (e) { console.warn('Não foi possível salvar Compra:', e.message); }

      return res.json({ qrCodeBase64: txn.qr_code_base64 || null, pixCopiaECola: txn.qr_code || txn.qr_code_text || null });
    }

    // Fluxo BOLETO
    if (method === 'boleto') {
      const payer = {
        email: email || 'cliente@nao-fornecido',
        first_name: user || 'Cliente',
        identification: {
          type: 'CPF',
          number: (req.body.cpf || '').replace(/\D/g, '') || '00000000000'
        }
      };

      const paymentData = {
        transaction_amount: Number(amount),
        description: (items && items.length) ? items.map(i => i.name).join(', ') : 'Compra na loja',
        payment_method_id: 'bolbradesco',
        payer,
      };

      const response = await mercadopago.payment.create(paymentData);
      const body = response && response.body ? response.body : response;
      const url = body.point_of_interaction && body.point_of_interaction.transaction_data && body.point_of_interaction.transaction_data.external_resource_url
        ? body.point_of_interaction.transaction_data.external_resource_url
        : (body.transaction_details && body.transaction_details.external_resource_url) || null;

      try {
        const compra = new Compra({ usuario: user || 'guest', itemId: (items && items[0] && items[0].id) || 'unknown', itemNome: paymentData.description, preco: Number(amount) });
        await compra.save();
      } catch (e) { console.warn('Não foi possível salvar Compra:', e.message); }

      return res.json({ boletoUrl: url });
    }

    // Fluxo CARTÃO (cria preference e retorna link de checkout)
    if (method === 'card') {
      const preference = {
        items: [
          {
            title: (items && items.length) ? items[0].name : 'Compra na loja',
            quantity: 1,
            currency_id: 'BRL',
            unit_price: Number(amount)
          }
        ],
        payer: { email: email || 'cliente@nao-fornecido' },
        back_urls: {
          success: process.env.SUCCESS_URL || 'https://example.com/success',
          failure: process.env.FAILURE_URL || 'https://example.com/failure',
          pending: process.env.PENDING_URL || 'https://example.com/pending'
        },
        auto_return: 'approved'
      };

      const pref = await mercadopago.preferences.create(preference);

      try {
        const compra = new Compra({ usuario: user || 'guest', itemId: (items && items[0] && items[0].id) || 'unknown', itemNome: preference.items[0].title, preco: Number(amount) });
        await compra.save();
      } catch (e) { console.warn('Não foi possível salvar Compra:', e.message); }

      return res.json({ init_point: pref.body.init_point, sandbox_init_point: pref.body.sandbox_init_point, success: true });
    }

    return res.status(400).json({ message: 'Método de pagamento não suportado.' });
  } catch (err) {
    console.error('Erro na rota /api/pagamento:', err);
    return res.status(500).json({ message: err.message || 'Erro interno ao processar pagamento.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});

function isUserOnline(usuario) {
  if (!usuario?.lastSeenAt) return false;
  const ttlMs = 2 * 60 * 1000;
  return Date.now() - new Date(usuario.lastSeenAt).getTime() <= ttlMs;
}

app.post("/user/heartbeat", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    usuario.lastSeenAt = new Date();
    await usuario.save();

    res.json({ ok: true, online: true });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao atualizar presença: " + err.message });
  }
});

// === ADMIN: Alertar usuário (cria um popup que aparecerá na próxima visita do usuário)
app.post("/admin/alertar-usuario", autenticar, verificarAdmin, async (req, res) => {
  try {
    if (req.usuario.nome !== "Dogue") {
      return res.status(403).json({ ok: false, mensagem: "❌ Apenas Dogue pode fazer isso!" });
    }

    const { nomeUsuario, title, message, codigo, onlineOnly = false } = req.body;
    if (!nomeUsuario) return res.status(400).json({ ok: false, mensagem: "Informe o nome do usuário." });

    const usuario = await Usuario.findOne({ nome: nomeUsuario });
    if (!usuario) return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });

    if (onlineOnly && !isUserOnline(usuario)) {
      return res.status(400).json({ ok: false, mensagem: "❌ O usuário está offline no momento." });
    }

    usuario.pendingAlert = {
      title: String(title || '').slice(0, 200),
      message: String(message || '').slice(0, 2000),
      codigo: codigo ? String(codigo).slice(0, 50) : null,
      tipo: 'normal',
      createdAt: new Date()
    };

    await usuario.save();

    console.log(`[ALERT-ADMIN] ${req.usuario.nome} enviou alerta para ${nomeUsuario}`);
    res.json({ ok: true, mensagem: `Alerta enviado para ${nomeUsuario}!` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao enviar alerta: " + err.message });
  }
});

// === ADMIN: Alertar TODOS os usuários (alerta global)
app.post("/admin/alertar-todos", autenticar, verificarAdmin, async (req, res) => {
  try {
    if (req.usuario.nome !== "Dogue") {
      return res.status(403).json({ ok: false, mensagem: "❌ Apenas Dogue pode fazer isso!" });
    }

    const { title, message, codigo, onlineOnly = false } = req.body;

    if (!title || !message) {
      return res.status(400).json({ ok: false, mensagem: "Informe title e message." });
    }

    const alerta = {
      title: String(title).slice(0, 200),
      message: String(message).slice(0, 2000),
      codigo: codigo ? String(codigo).slice(0, 50) : null,
      createdAt: new Date(),
      tipo: 'global'
    };

    const filtro = onlineOnly
      ? { lastSeenAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) } }
      : {};

    const result = await Usuario.updateMany(filtro, { $set: { pendingAlert: alerta } });

    console.log(`[ALERT-GLOBAL] ${req.usuario.nome} enviou alerta para ${result.modifiedCount} usuários`);

    res.json({
      ok: true,
      mensagem: onlineOnly
        ? `Alerta global enviado para ${result.modifiedCount} usuários online!`
        : `Alerta global enviado para ${result.modifiedCount} usuários!`,
      usuariosAfetados: result.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao enviar alerta global: " + err.message });
  }
});

// Endpoint para o usuário obter e limpar o alerta pendente
app.get("/user/alerts", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });

    // Se não tem alerta, retorna null
    if (!usuario.pendingAlert || (!usuario.pendingAlert.title && !usuario.pendingAlert.message)) {
      return res.json({ ok: true, alert: null });
    }

    // Pega o alerta atual
    const alert = {
      title: usuario.pendingAlert.title || '',
      message: usuario.pendingAlert.message || '',
      codigo: usuario.pendingAlert.codigo || null, // novo: já vem o código
      tipo: usuario.pendingAlert.tipo || 'normal', // novo: 'normal' ou 'global'
      createdAt: usuario.pendingAlert.createdAt || null
    };

    // Limpar o alerta após ler - aparece apenas 1 vez por usuário
    usuario.pendingAlert = { title: '', message: '', codigo: null, tipo: null, createdAt: null };
    await usuario.save();

    console.log(`[ALERT-READ] ${req.usuario.nome} leu alerta tipo: ${alert.tipo}`);

    res.json({ ok: true, alert });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao obter alertas: " + err.message });
  }
});

// Catálogo unificado de preços e tipos
const CATALOGO = {
  // Gemas
  "100-gemas": { price: 1, type: "gemas", quantidade: 100 },
  "500-gemas": { price: 2.5, type: "gemas", quantidade: 500 },
  "1000-gemas": { price: 4, type: "gemas", quantidade: 1000 },
  "2500-gemas": { price: 7, type: "gemas", quantidade: 2500 },
  "5000-gemas": { price: 10, type: "gemas", quantidade: 5000 },
  "10000-gemas": { price: 15, type: "gemas", quantidade: 10000 },
  
  // Giros
  "10-giros": { price: 1, type: "giros", quantidade: 10 },
  "50-giros": { price: 4, type: "giros", quantidade: 50 },
  "100-giros": { price: 7, type: "giros", quantidade: 100 },
  "250-giros": { price: 15, type: "giros", quantidade: 250 },
  "500-giros": { price: 28, type: "giros", quantidade: 500 },
  
  // Itens
  "cor-comum": { price: 1, type: "item" },
  "cor-especial": { price: 1, type: "item" },
  "custom-tag": { price: 1, type: "item" },
  "premium-xp": { price: 5, type: "item" },
  "ultra-xp": { price: 10, type: "item" },
  
  // Serviços
  "max-rank": { price: 10, type: "special" },
  "max-rank-premium": { price: 12, type: "special" },
  "max-rank-ultra": { price: 15, type: "special" },
  "max-rank-ultra-diamonds": { price: 30, type: "special" }
};

// Função auxiliar para creditar itens ao usuário no banco
async function aplicarRecompensas(nomeUsuario, items) {
  const usuarioDoc = await Usuario.findOne({ nome: nomeUsuario });
  if (!usuarioDoc) return;

  for (const item of items) {
    const itemData = CATALOGO[item.id];
    if (!itemData) continue;

    switch (itemData.type) {
      case "gemas":
        usuarioDoc.moedas = (usuarioDoc.moedas || 0) + itemData.quantidade;
        break;

      case "giros":
        usuarioDoc.spins = (usuarioDoc.spins || 0) + itemData.quantidade;
        break;

      case "item":
        if (!usuarioDoc.ItensComprados) usuarioDoc.ItensComprados = [];
        usuarioDoc.ItensComprados.push(item.id);
        break;

      case "special":
        if (item.id === "max-rank") {
          usuarioDoc.xp = 2000000;
        } else if (item.id === "max-rank-premium") {
          usuarioDoc.xp = 2000000;
          if (!usuarioDoc.ItensComprados) usuarioDoc.ItensComprados = [];
          usuarioDoc.ItensComprados.push("premium-xp");
        } else if (item.id === "max-rank-ultra") {
          usuarioDoc.xp = 2000000;
          if (!usuarioDoc.ItensComprados) usuarioDoc.ItensComprados = [];
          usuarioDoc.ItensComprados.push("ultra-xp");
        } else if (item.id === "max-rank-ultra-diamonds") {
          usuarioDoc.xp = 2000000;
          if (!usuarioDoc.ItensComprados) usuarioDoc.ItensComprados = [];
          usuarioDoc.ItensComprados.push("ultra-xp");
          usuarioDoc.moedas = (usuarioDoc.moedas || 0) + 30000;
        }
        break;
    }
  }

  await usuarioDoc.save();
}

// ROTA DE PAGAMENTO
app.post("/api/pagamento", async (req, res) => {
  try {
    const { user, email, amount, method, items } = req.body || {};

    // 1. Validação de presença de campos obrigatórios
    if (!user || !email || !amount || !method || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, mensagem: "❌ Informações e parâmetros obrigatórios ausentes!" });
    }

    if (!MP_TOKEN) {
      return res.status(500).json({ ok: false, mensagem: "Token do Mercado Pago não configurado no servidor." });
    }

    // 2. Validação da existência do usuário no Banco de Dados
    const usuarioExiste = await Usuario.exists({ nome: user });
    if (!usuarioExiste) {
      return res.status(404).json({ ok: false, mensagem: "❌ Usuário Não Existe" });
    }

    // 3. Validação e soma dos preços contra a tabela oficial
    let totalCalculado = 0;
    for (const item of items) {
      const itemCadastrado = CATALOGO[item.id];
      if (!itemCadastrado) {
        return res.status(400).json({ ok: false, mensagem: `❌ Item inválido ou não encontrado: ${item.id}` });
      }
      totalCalculado += itemCadastrado.price;
    }

    // Tolerância para divergência de centavos no float
    if (Math.abs(totalCalculado - Number(amount)) > 0.01) {
      return res.status(400).json({ ok: false, mensagem: "❌ O valor enviado não corresponde ao total dos itens!" });
    }

    const descricaoCompra = items.map(i => i.id).join(", ");

    // 4. Fluxo PIX
    if (method === "pix") {
      const paymentData = {
        transaction_amount: Number(amount),
        description: descricaoCompra,
        payment_method_id: "pix",
        payer: {
          email: email,
          first_name: user
        }
      };

      const response = await mercadopago.payment.create(paymentData);
      const body = response && response.body ? response.body : response;
      const txn = (body.point_of_interaction && body.point_of_interaction.transaction_data) ? body.point_of_interaction.transaction_data : {};

      // Registro do log da compra
      try {
        const compra = new Compra({ usuario: user, itemId: items[0].id, itemNome: descricaoCompra, preco: Number(amount) });
        await compra.save();
      } catch (e) {
        console.warn("Não foi possível salvar log de Compra:", e.message);
      }

      return res.json({
        ok: true,
        qrCodeBase64: txn.qr_code_base64 || null,
        pixCopiaECola: txn.qr_code || txn.qr_code_text || null
      });
    }

    // 5. Fluxo BOLETO
    if (method === "boleto") {
      const paymentData = {
        transaction_amount: Number(amount),
        description: descricaoCompra,
        payment_method_id: "bolbradesco",
        payer: {
          email: email,
          first_name: user,
          identification: {
            type: "CPF",
            number: (req.body.cpf || "").replace(/\D/g, "") || "00000000000"
          }
        }
      };

      const response = await mercadopago.payment.create(paymentData);
      const body = response && response.body ? response.body : response;
      const url = body.point_of_interaction && body.point_of_interaction.transaction_data && body.point_of_interaction.transaction_data.external_resource_url
        ? body.point_of_interaction.transaction_data.external_resource_url
        : (body.transaction_details && body.transaction_details.external_resource_url) || null;

      try {
        const compra = new Compra({ usuario: user, itemId: items[0].id, itemNome: descricaoCompra, preco: Number(amount) });
        await compra.save();
      } catch (e) {
        console.warn("Não foi possível salvar log de Compra:", e.message);
      }

      return res.json({ ok: true, boletoUrl: url });
    }

    // 6. Fluxo CARTÃO (Gera Preference do Checkout)
    if (method === "card") {
      const preference = {
        items: items.map(i => ({
          title: i.id,
          quantity: 1,
          currency_id: "BRL",
          unit_price: CATALOGO[i.id].price
        })),
        payer: { email: email },
        back_urls: {
          success: process.env.SUCCESS_URL || "https://example.com/success",
          failure: process.env.FAILURE_URL || "https://example.com/failure",
          pending: process.env.PENDING_URL || "https://example.com/pending"
        },
        auto_return: "approved"
      };

      const pref = await mercadopago.preferences.create(preference);

      try {
        const compra = new Compra({ usuario: user, itemId: items[0].id, itemNome: descricaoCompra, preco: Number(amount) });
        await compra.save();
      } catch (e) {
        console.warn("Não foi possível salvar log de Compra:", e.message);
      }

      return res.json({
        ok: true,
        init_point: pref.body.init_point,
        sandbox_init_point: pref.body.sandbox_init_point
      });
    }

    return res.status(400).json({ ok: false, mensagem: "Método de pagamento não suportado." });

  } catch (err) {
    console.error("Erro na rota /api/pagamento:", err);
    return res.status(500).json({ ok: false, mensagem: "Falha ao processar compra: " + err.message });
  }
});

// Rota para receber notificações assíncronas do Mercado Pago
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;

    // Verifica se a notificação é de um pagamento
    if (type === 'payment' && data && data.id) {
      // Busca os detalhes atualizados do pagamento na API do MP
      const paymentResponse = await mercadopago.payment.get(data.id);
      const payment = paymentResponse.body;

      // Se o pagamento foi APROVADO
      if (payment.status === 'approved') {
        // Recupera os dados salvos nas métricas/metadados
        const usuarioNome = payment.metadata?.usuario;
        const itemsComprados = payment.metadata?.items;

        if (usuarioNome && itemsComprados) {
          // Entrega os itens no banco de dados
          await aplicarRecompensas(usuarioNome, itemsComprados);
          console.log(`✅ Recompensas entregues com sucesso para ${usuarioNome}!`);
        }
      }
    }

    // Responde 200 OK para o Mercado Pago saber que você recebeu a notificação
    res.sendStatus(200);
  } catch (err) {
    console.error('Erro ao processar Webhook do Mercado Pago:', err);
    res.sendStatus(500);
  }
});