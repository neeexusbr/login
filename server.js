const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "stevejobs"; // use variável de ambiente no Render

app.use(express.json({ limit: '50mb' })); // Aumentar limite de tamanho
app.use(cors({
    origin: ["https://neeexusbr.github.io", "https://neeexusbr.netlify.app/", "http://localhost:3000", "http://localhost:5500"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

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
  jogosSecretos: [String],
  itensComprados: [String],
  tempo_jogo: { type: Number, default: 0 },
  spins: { type: Number, default: 0 }, // Giros da roleta
  tagPersonalizada: { type: String, default: '' },
  corTagPersonalizada: { type: String, default: '#a855f7' }, // roxo padrão
  tipoCorTag: { type: String, default: 'comum' }, // 'comum' ou 'especial'
  foto_perfil: { type: String, default: '' },
  corBordaPerfil: { type: String, default: '#ffd700' }, // cor da borda do perfil
  idCorBordaPerfil: { type: String, default: 'gold' }, // id da cor de borda selecionada
  lootboxes: {
    comum: { type: Number, default: 0 },
    rara: { type: Number, default: 0 },
    epica: { type: Number, default: 0 },
    lendaria: { type: Number, default: 0 }
  }
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

    const token = jwt.sign({ nome: usuario.nome, isAdmin: usuario.isAdmin }, SECRET, { expiresIn: "30d" });
    res.json({ ok: true, mensagem: "Login realizado com sucesso!", token, isAdmin: usuario.isAdmin });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro no login: " + err.message });
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

  jwt.verify(token, SECRET, (err, usuario) => {
    if (err) {
      console.log('[AUTH] ERRO ao verificar token:', err.message);
      return res.status(403).json({ ok: false, mensagem: "Token inválido ou expirado! " + err.message });
    }
    console.log('[AUTH] Token válido para usuário:', usuario.nome);
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

    // Retornar estrutura otimizada
    const dadosRetorno = {
      dados: backup.dados.dados || {},
      achievements: backup.dados.achievements || [],
      unlockedGames: backup.dados.unlockedGames || [],
      purchasedItems: backup.dados.purchasedItems || [],
      preferences: backup.dados.preferences || {},
      timestamp: backup.dados.timestamp || backup.atualizadoEm.toISOString()
    };

    const tamanho = JSON.stringify(dadosRetorno).length;
    console.log(`[RESTORE] Usuário ${req.usuario.nome} - ${(tamanho/1024).toFixed(2)}KB`);

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

app.post("/admin/adicionar-moedas", autenticar, verificarAdmin, async (req, res) => {
  try {
    const { nomeUsuario, quantidade } = req.body;
    const usuario = await Usuario.findOne({ nome: nomeUsuario });

    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    // Se for Yohanan (dono), adiciona direto sem aprovação
    if (req.usuario.nome === "Yohanan") {
      usuario.moedas = (usuario.moedas || 0) + quantidade;
      await usuario.save();
      
      console.log(`[MOEDAS-DIRETO] Yohanan adicionou ${quantidade} moedas direto a ${nomeUsuario}`);
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

    // Verificar se é uma lootbox
    if (itemId.startsWith('lootbox-')) {
      const tipoLootbox = itemId.replace('lootbox-', '');
      if (['comum', 'rara', 'epica', 'lendaria'].includes(tipoLootbox)) {
        if (!usuario.lootboxes) {
          usuario.lootboxes = { comum: 0, rara: 0, epica: 0, lendaria: 0 };
        }
        usuario.lootboxes[tipoLootbox] = (usuario.lootboxes[tipoLootbox] || 0) + 1;
        await usuario.save();
        return res.json({ ok: true, mensagem: `✅ Lootbox ${tipoLootbox} adicionada a ${nomeUsuario}!` });
      }
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
  // Apenas Yohanan pode promover admins
  if (!req.usuario || req.usuario.nome !== "Yohanan") {
    return res.status(403).json({ ok: false, mensagem: "❌ Apenas Yohanan pode promover admins!" });
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
    const usuarios = await Usuario.find({}, { nome: 1, moedas: 1, isAdmin: 1, _id: 0 });
    res.json({ ok: true, usuarios });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ROTAS RESTRITAS APENAS PARA YOHANAN ===
function verificarYohanan(req, res, next) {
  if (!req.usuario || req.usuario.nome !== "Yohanan") {
    return res.status(403).json({ ok: false, mensagem: "❌ Apenas Yohanan tem permissão para isso!" });
  }
  next();
}

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
    // Apenas Yohanan pode ver as solicitações
    if (req.usuario.nome !== "Yohanan") {
      return res.status(403).json({ ok: false, mensagem: "Apenas Yohanan pode visualizar solicitações!" });
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
    // Apenas Yohanan (admin) pode ver as notificações
    if (req.usuario.nome !== "Yohanan") {
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
    // Apenas Yohanan pode ver o histórico
    if (req.usuario.nome !== "Yohanan") {
      return res.status(403).json({ ok: false, mensagem: "Apenas Yohanan pode visualizar histórico!" });
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
app.post("/aprovar-solicitacao", autenticar, verificarYohanan, async (req, res) => {
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
app.post("/rejeitar-solicitacao", autenticar, verificarYohanan, async (req, res) => {
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

// Remover Admin (apenas Yohanan)
app.post("/admin/remover-admin", autenticar, verificarYohanan, async (req, res) => {
  try {
    const { nomeUsuario } = req.body;

    // Proteção para não remover Yohanan
    if (nomeUsuario === "Yohanan") {
      return res.status(403).json({ ok: false, mensagem: "❌ Você não pode remover admin de Yohanan!" });
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

// Mudar Tag de Usuário (apenas Yohanan)
app.post("/admin/mudar-tag-usuario", autenticar, verificarYohanan, async (req, res) => {
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

    console.log(`[TAG-ADMIN] Yohanan alterou a tag de ${nomeUsuario} para: ${novaTag}`);
    res.json({ ok: true, mensagem: `✅ Tag de ${nomeUsuario} alterada para: ${novaTag}` });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Mudar Foto de Perfil de Usuário (apenas Yohanan)
app.post("/admin/mudar-foto-usuario", autenticar, verificarYohanan, async (req, res) => {
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

    console.log(`[PHOTO-ADMIN] Yohanan alterou a foto de ${nomeUsuario}`);
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

// Botão de Emergência - Resetar Admins (apenas Yohanan)
app.post("/admin/emergencia-reset", autenticar, verificarYohanan, async (req, res) => {
  try {
    // Remover admin de todos os usuários
    await Usuario.updateMany({}, { isAdmin: false });

    // Definir Yohanan como único admin
    const yohanan = await Usuario.findOne({ nome: "Yohanan" });
    if (yohanan) {
      yohanan.isAdmin = true;
      await yohanan.save();
    }

    console.log("[EMERGENCIA] Yohanan acionou o botão de emergência - Admins resetados!");
    res.json({ ok: true, mensagem: "🚨 Emergência acionada! Todos os admins foram removidos. Apenas Yohanan é admin agora." });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// === ENDPOINTS DE LEADERBOARD ===
app.get("/leaderboard", async (req, res) => {
  try {
    const usuarios = await Usuario.find({}, { nome: 1, tempo_jogo: 1, moedas: 1, foto_perfil: 1, tagPersonalizada: 1, corTagPersonalizada: 1, tipoCorTag: 1, corBordaPerfil: 1, idCorBordaPerfil: 1, _id: 0 })
      .sort({ tempo_jogo: -1 })
      .limit(10)
      .lean(); // Converter para objeto puro do JavaScript

    // Distribuir prêmios
    const usuariosComPremio = usuarios.map((user, index) => {
      let premio = 0;
      if (index === 0) premio = 10000;
      else if (index === 1) premio = 5000;
      else if (index === 2) premio = 2000;
      else if (index >= 3 && index <= 9) premio = 1500;

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

// === LEADERBOARD DE MOEDAS ===
app.get("/leaderboard/moedas", async (req, res) => {
  try {
    const usuarios = await Usuario.find({}, { nome: 1, moedas: 1, foto_perfil: 1, tagPersonalizada: 1, corTagPersonalizada: 1, tipoCorTag: 1, corBordaPerfil: 1, idCorBordaPerfil: 1, tempo_jogo: 1, _id: 0 })
      .sort({ moedas: -1 })
      .limit(10)
      .lean();

    // Distribuir prêmios baseado em moedas
    const usuariosComPremio = usuarios.map((user, index) => {
      let premio = 0;
      if (index === 0) premio = 5000;
      else if (index === 1) premio = 3000;
      else if (index === 2) premio = 1000;
      else if (index >= 3 && index <= 9) premio = 500;

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
    const usuarios = await Usuario.find({}, { nome: 1, spins: 1, foto_perfil: 1, tagPersonalizada: 1, corTagPersonalizada: 1, tipoCorTag: 1, corBordaPerfil: 1, idCorBordaPerfil: 1, tempo_jogo: 1, moedas: 1, _id: 0 })
      .sort({ spins: -1 })
      .limit(10)
      .lean();

    // Distribuir prêmios baseado em giros
    const usuariosComPremio = usuarios.map((user, index) => {
      let premio = 0;
      if (index === 0) premio = 20;
      else if (index === 1) premio = 15;
      else if (index === 2) premio = 10;
      else if (index >= 3 && index <= 9) premio = 5;

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
      return res.status(400).json({ ok: false, mensagem: "Tag deve ter entre 1 e 10 caracteres!" });
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
    const usuario = await Usuario.findOne({ nome: req.usuario.nome }, { nome: 1, moedas: 1, foto_perfil: 1, tagPersonalizada: 1, corTagPersonalizada: 1, tipoCorTag: 1, tempo_jogo: 1, _id: 0 });

    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    res.json({ 
      ok: true, 
      usuario: {
        nome: usuario.nome,
        moedas: parseInt(usuario.moedas) || 0,
        foto_perfil: usuario.foto_perfil || '',
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

// === ENDPOINT PARA SINCRONIZAR MOEDAS ===
app.post("/sincronizar-moedas", autenticar, async (req, res) => {
  try {
    const { moedas } = req.body;

    // Validar entrada
    const moedAsInt = parseInt(moedas);
    if (isNaN(moedAsInt) || moedAsInt < 0) {
      console.error(`[SYNC] Valor de moedas inválido: ${moedas}`);
      return res.status(400).json({ ok: false, mensagem: "Valor de moedas inválido!" });
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      console.error(`[SYNC] Usuário não encontrado: ${req.usuario.nome}`);
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    usuario.moedas = moedAsInt;
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

    if (typeof spins !== 'number' || spins < 0) {
      return res.status(400).json({ ok: false, mensagem: "Valor de spins inválido!" });
    }

    const usuario = await Usuario.findOne({ nome: req.usuario.nome });
    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado!" });
    }

    usuario.spins = spins;
    await usuario.save();

    console.log(`[SPINS] ${req.usuario.nome} agora tem ${spins} giros`);
    res.json({ ok: true, spins: usuario.spins });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro ao atualizar spins: " + err.message });
  }
});

// Adicionar giros a um usuário (apenas Yohanan)
app.post("/admin/adicionar-giros", autenticar, async (req, res) => {
  try {
    // Apenas Yohanan pode usar
    if (req.usuario.nome !== "Yohanan") {
      return res.status(403).json({ ok: false, mensagem: "❌ Apenas Yohanan pode adicionar giros!" });
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

    console.log(`[GIROS-ADMIN] Yohanan adicionou ${quantidade} giros a ${nomeUsuario}`);
    res.json({ ok: true, mensagem: `✅ ${quantidade} giro(s) adicionado(s) a ${nomeUsuario}!`, novosGiros: usuario.spins });
  } catch (err) {
    res.status(500).json({ ok: false, mensagem: "Erro: " + err.message });
  }
});

// Adicionar tempo de jogo a um usuário (apenas Yohanan)
app.post("/admin/adicionar-tempo-jogo", autenticar, async (req, res) => {
  try {
    // Apenas Yohanan pode usar
    if (req.usuario.nome !== "Yohanan") {
      return res.status(403).json({ ok: false, mensagem: "❌ Apenas Yohanan pode adicionar tempo de jogo!" });
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

    console.log(`[TEMPO-ADMIN] Yohanan adicionou ${minutos} minutos a ${nomeUsuario}`);
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

    console.log(`[CHAT-GLOBAL] Retornando ${mensagensOrdenadas.length} mensagens`);
    res.json({ ok: true, mensagens: mensagensOrdenadas });
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

    // Marcar como lidas as mensagens recebidas
    await MensagemPrivada.updateMany(
      {
        remetente: usuario,
        destinatario: req.usuario.nome,
        lida: false
      },
      { lida: true }
    );

    console.log(`[CHAT] ${req.usuario.nome} abriu conversa com ${usuario} (${mensagens.length} mensagens)`);

    res.json({ 
      ok: true, 
      mensagens: mensagens,
      total: mensagens.length
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

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});