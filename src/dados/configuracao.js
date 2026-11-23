// Configurações simples (chave/valor) guardadas no próprio banco cifrado.
function criarConfiguracao(db) {
  const ler = db.prepare("SELECT valor FROM configuracao WHERE chave = ?").pluck();
  const gravar = db.prepare(
    `INSERT INTO configuracao (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor,
       alterado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  );
  const apagar = db.prepare("DELETE FROM configuracao WHERE chave = ?");

  return {
    obter(chave, padrao = null) {
      const v = ler.get(chave);
      return v === undefined || v === null ? padrao : v;
    },
    definir(chave, valor) {
      if (valor === null || valor === undefined) apagar.run(chave);
      else gravar.run(chave, String(valor));
    },
  };
}

module.exports = { criarConfiguracao };
