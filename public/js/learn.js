/* ══════════════════════════════════════════════════════════════════════
   Bélote Gasy — documentation, apprentissage & conseils.
   Three tabs rendered into #learnBody: full rules, an interactive quiz
   with explanations, and practical strategy advice.
   ══════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  const GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ─────────────────────────────────────────────────────────────── rules ──

  const RULES = [
    {
      h: '1 · Principe de base',
      body: [
        '<p><b>Bélote Gasy</b> se joue à <b>4 joueurs</b> répartis en <b>2 équipes de 2</b> (les partenaires sont assis face à face) avec un jeu de <b>32 cartes</b> (du 7 à l’As).</p>',
        '<p>Le vocabulaire malgache essentiel :</p>',
        '<ul class="voc">' +
          '<li><b>Appel (maka)</b> — annoncer le contrat ; celui qui appelle est le preneur (<i>mpanaka</i>).</li>' +
          '<li><b>Bon</b> — accepter le contrat annoncé par l’autre équipe.</li>' +
          '<li><b>Maty</b> — « mort » : le preneur chute, son équipe marque 0 dizaine.</li>' +
          '<li><b>Miboty</b> — couper à l’atout quand on n’a pas la couleur demandée.</li>' +
          '<li><b>Pisser</b> — jeter une carte inutile (permis quand le partenaire est maître).</li>' +
          '<li><b>Dix de der</b> — le dernier pli, bonus de 10 points.</li>' +
          '<li><b>Tsy miharitra</b> (Trèfle) — le contrat « caché » à 64 dizaines.</li>' +
          '<li><b>Atao daholo</b> — Tout-Atout (26 dizaines) ; <b>Tsy misy atao</b> — Sans-Atout (52 dizaines).</li>' +
        '</ul>',
      ].join(''),
    },
    {
      h: '2 · Distribution en deux temps',
      body: [
        '<p><b>1. Premier temps :</b> on distribue <b>5 cartes à chaque joueur</b> (en paquets de 3 puis 2). Les <b>12 cartes restantes</b> restent au talon, face cachée.</p>',
        '<p><b>2. L’appel (les enchères)</b> se fait donc avec seulement <b>5 cartes en main</b> : on ignore encore les 3 cartes du talon.</p>',
        '<p><b>3. Une fois le jeu décidé,</b> on distribue les <b>3 dernières cartes à chaque joueur</b> (8 cartes en main), puis on joue les plis.</p>',
      ].join(''),
    },
    {
      h: '3 · Les enchères — l’appel « Maka »',
      body: [
        '<p>L’appel se fait <b>tour par tour</b> selon la valeur des contrats :</p>',
        '<table class="rule-table">' +
          '<tr><th>Jeu annoncé</th><th>Nom local</th><th>Valeur du contrat</th></tr>' +
          '<tr><td>Pique, Cœur, Carreau</td><td>Couleur classique</td><td><b>16 dizaines</b></td></tr>' +
          '<tr><td>Trèfle</td><td><i>Tsy miharitra trèfle</i></td><td><b>64 dizaines</b></td></tr>' +
          '<tr><td>Tout-Atout (TA)</td><td><i>Atao daholo</i></td><td><b>26 dizaines</b></td></tr>' +
          '<tr><td>Sans-Atout (SA)</td><td><i>Tsy misy atao</i></td><td><b>52 dizaines</b></td></tr>' +
        '</table>',
        '<ul class="voc">' +
          '<li><b>Le premier joueur qui appelle ne peut pas passer :</b> il choisit entre les quatre couleurs, le Sans-Atout ou le Tout-Atout.</li>' +
          '<li>Les joueurs suivants n’ont <b>pas le droit d’appeler un jeu inférieur ou égal</b> à l’appel précédent : soit ils disent <b>« bon »</b>, soit ils <b>« contrent »</b>, soit ils font <b>un appel strictement supérieur</b> — et ainsi de suite. (Les quatre couleurs valant toutes 16 dizaines, on ne peut pas « monter » d’une couleur à l’autre.)</li>' +
          '<li>Le <b>partenaire</b> du dernier appelant ne peut pas annoncer une autre couleur : seuls les adversaires le peuvent. Il peut dire « bon » ou appeler <b>Sans-Atout / Tout-Atout</b>.</li>' +
          '<li><b>Combien de « bon » ?</b> Pour <b>Sans-Atout et Trèfle, un seul « bon » ferme</b> les enchères. Pour <b>Pique, Cœur, Carreau et Tout-Atout</b>, il faut <b>trois « bon »</b> consécutifs.</li>' +
          '<li><b>Contre :</b> un joueur (adversaire de l’appelant) qui pense que le contrat ne sera pas réussi peut <b>contrer</b> : les enchères s’arrêtent, le contrat se joue <b>contré (×2)</b>. Le partenaire du preneur peut alors <b>surcontrer (×4)</b> — sauf pour Trèfle et Sans-Atout — ou dire « bon ».</li>' +
          '<li>Dès que le jeu est décidé, chacun reçoit ses <b>3 dernières cartes</b> et la partie commence.</li>' +
        '</ul>',
      ].join(''),
    },
    {
      h: '4 · Ordre et valeur des cartes',
      body: [
        '<p><b>En couleur d’atout :</b></p>',
        '<table class="rule-table">' +
          '<tr><th>Carte</th><th>Valeur</th></tr>' +
          '<tr><td>Valet (J)</td><td><b>20 points</b></td></tr>' +
          '<tr><td>9</td><td><b>14 points</b></td></tr>' +
          '<tr><td>As (A)</td><td><b>11 points</b></td></tr>' +
          '<tr><td>10</td><td><b>10 points</b></td></tr>' +
          '<tr><td>Roi (K)</td><td><b>4 points</b></td></tr>' +
          '<tr><td>Dame (Q)</td><td><b>3 points</b></td></tr>' +
          '<tr><td>8 / 7</td><td>0 point</td></tr>' +
        '</table>',
        '<p><b>En couleur non-atout :</b></p>',
        '<table class="rule-table">' +
          '<tr><th>Carte</th><th>Valeur</th></tr>' +
          '<tr><td>As (A)</td><td><b>11 points</b></td></tr>' +
          '<tr><td>10</td><td><b>10 points</b></td></tr>' +
          '<tr><td>Roi (K)</td><td><b>4 points</b></td></tr>' +
          '<tr><td>Dame (Q)</td><td><b>3 points</b></td></tr>' +
          '<tr><td>Valet (J)</td><td><b>2 points</b></td></tr>' +
          '<tr><td>9 / 8 / 7</td><td>0 point</td></tr>' +
        '</table>',
        '<ul class="voc">' +
          '<li><b>Tout-Atout :</b> toutes les cartes prennent leur valeur d’atout — le Valet est le plus fort <i>dans chaque couleur</i> (ordre J · 9 · A · 10 · R · D · 8 · 7).</li>' +
          '<li><b>Sans-Atout :</b> seules les valeurs ordinaires comptent, l’As est la carte la plus forte (ordre A · 10 · R · D · V · 9 · 8 · 7).</li>' +
          '<li>Total d’une manche en couleur : <b>152 points de cartes + 10 (dix de der) = 162 points</b>.</li>' +
        '</ul>',
      ].join(''),
    },
    {
      h: '5 · Comptage en dizaines',
      body: [
        '<p>Chaque manche rapporte des <b>dizaines</b>. Les points de chaque équipe sont arrondis :</p>',
        '<ul class="voc">' +
          '<li>Unités de <b>1 à 5</b> → arrondi au chiffre <b>inférieur</b> (ex. 84 → 8 dizaines).</li>' +
          '<li>Unités de <b>6 à 9</b> → passage à la dizaine <b>supérieure</b> (ex. <b>86 points → 9 dizaines</b>).</li>' +
        '</ul>',
        '<p><b>Objectif de la partie : la première équipe qui atteint 150 dizaines remporte la partie.</b></p>',
      ].join(''),
    },
    {
      h: '6 · Score d’une manche',
      body: [
        '<p><b>A. Cas général — couleur classique, Trèfle et Sans-Atout (« tout ou rien ») :</b></p>',
        '<ul class="voc">' +
          '<li>Si l’équipe prenante <b>réussit son contrat</b> (plus de points que l’adversaire), elle remporte <b>la totalité des dizaines</b> de la valeur du jeu (16, 52 ou 64).</li>' +
          '<li>Si elle <b>chute (Maty)</b>, l’équipe adverse récupère <b>la totalité</b> des dizaines du jeu ; le preneur marque 0.</li>' +
        '</ul>',
        '<p><b>B. Cas particulier — Tout-Atout (26 dizaines) :</b></p>',
        '<ul class="voc">' +
          '<li>Si le preneur <b>gagne</b> : les points de plis de chaque équipe sont convertis en dizaines (arrondi ci-dessus) et <b>répartis entre les deux équipes</b> — leur somme donne les 26 dizaines du jeu. L’équipe qui remporte le dernier pli (dix de der) est comptée en premier, l’autre prend le reste.</li>' +
          '<li>Si le preneur <b>chute</b> : la répartition est annulée, l’adversaire emporte <b>les 26 dizaines</b>.</li>' +
        '</ul>',
        '<p>Un <b>contre</b> multiplie les dizaines en jeu par 2, un <b>surcontre</b> par 4.</p>',
      ].join(''),
    },
    {
      h: '7 · Déroulement des plis — « miboty »',
      body: [
        '<ul class="voc">' +
          '<li><b>Fournir :</b> on doit toujours jouer la couleur demandée si on en a.</li>' +
          '<li><b>Miboty / couper :</b> sans la couleur demandée, on <b>doit couper</b> à l’atout si l’adversaire est maître du pli. Si <b>son propre partenaire est maître</b>, on n’est pas obligé de couper (on peut « pisser » une carte inutile).</li>' +
          '<li><b>Surenchère à l’atout :</b> si de l’atout est joué, tout joueur devant jouer atout doit <b>obligatoirement poser un atout plus fort (monter)</b>.</li>' +
          '<li><b>Tout-Atout :</b> on ne peut pas couper (toutes les couleurs sont atout), mais il faut <b>toujours monter</b> sur la carte maître quand c’est possible.</li>' +
          '<li><b>Sans-Atout :</b> aucune coupe possible, on fournit simplement la couleur demandée.</li>' +
          '<li><b>Dix de der :</b> l’équipe qui remporte le 8<sup>e</sup> et dernier pli gagne <b>+10 points</b>.</li>' +
        '</ul>',
      ].join(''),
    },
    {
      h: '8 · Fin de partie',
      body: [
        '<p>La partie s’achève dès qu’une équipe atteint <b>150 dizaines</b>. En cas d’égalité au terme d’une manche, on continue jusqu’à ce qu’une équipe passe seule la barre des 150.</p>',
        '<p class="tip">💡 Pas de belote-rebelote ni de capot en Bélote Gasy : seuls comptent les points de cartes, le dix de der et le contrat (« tout ou rien »).</p>',
      ].join(''),
    },
  ];

  // ─────────────────────────────────────────────────────────────── quiz ──

  const QUIZ = [
    {
      q: 'Combien de cartes reçoit chaque joueur avant l’appel ?',
      opts: ['5 cartes', '8 cartes', '10 cartes', '13 cartes'],
      a: 0,
      why: 'L’appel se fait avec 5 cartes en main (3 puis 2). Les 3 cartes restantes ne sont distribuées qu’après la décision du contrat.',
    },
    {
      q: 'Le premier joueur qui appelle peut-il passer ?',
      opts: ['Oui, s’il a une mauvaise main', 'Non, il doit choisir une couleur, SA ou TA', 'Oui, à condition de dire « bon »', 'Seulement après un contre'],
      a: 1,
      why: 'Le premier appelant ne peut pas passer : il est obligé d’appeler — une couleur, Sans-Atout ou Tout-Atout.',
    },
    {
      q: 'Quel est l’objectif de la partie ?',
      opts: ['100 points', '162 points', '150 dizaines', '301 dizaines'],
      a: 2,
      why: 'La partie est remportée par la première équipe qui atteint 150 dizaines.',
    },
    {
      q: 'Combien vaut le Valet en atout ?',
      opts: ['2 points', '10 points', '14 points', '20 points'],
      a: 3,
      why: 'En atout : Valet 20, 9 → 14, As → 11, 10 → 10, Roi → 4, Dame → 3, 8 et 7 → 0.',
    },
    {
      q: 'Quel est l’ordre des cartes à l’atout (du plus fort au plus faible) ?',
      opts: ['A · 10 · R · D · V · 9 · 8 · 7', 'J · 9 · A · 10 · R · D · 8 · 7', '9 · J · A · 10 · R · D · 8 · 7', 'J · A · 9 · 10 · R · D · 8 · 7'],
      a: 1,
      why: 'À l’atout, le Valet est le plus fort, suivi du 9, de l’As, du 10, du Roi, de la Dame, du 8 et du 7.',
    },
    {
      q: 'À combien s’élève le total d’une manche (cartes + dix de der) en jeu de couleur ?',
      opts: ['150 points', '162 points', '172 points', '200 points'],
      a: 1,
      why: '152 points de cartes + 10 points pour le dernier pli (« dix de der ») = 162 points.',
    },
    {
      q: 'Votre équipe totalise 86 points en Tout-Atout. Combien de dizaines cela fait-il ?',
      opts: ['8 dizaines', '9 dizaines', '8,6 dizaines', '86 dizaines'],
      a: 1,
      why: 'Les unités de 6 à 9 font passer à la dizaine supérieure : 86 points → 9 dizaines.',
    },
    {
      q: 'Quelle est la valeur du contrat « Trèfle » (tsy miharitra) ?',
      opts: ['16 dizaines', '26 dizaines', '52 dizaines', '64 dizaines'],
      a: 3,
      why: 'Le Trèfle est la couleur spéciale : 64 dizaines — le contrat le plus cher du jeu.',
    },
    {
      q: 'Un appel de 16 dizaines (Pique) est en cours. Que ne pouvez-vous PAS faire ?',
      opts: ['Dire « bon »', 'Contrer', 'Appeler Carreau (16 dz)', 'Appeler Sans-Atout (52 dz)'],
      a: 2,
      why: '« Bon », le contre et un appel strictement supérieur (Sans-Atout 52, Trèfle 64…) restent possibles. Mais les quatre couleurs valent toutes 16 dizaines : un appel égal n’est pas un appel supérieur, il est donc interdit.',
    },
    {
      q: 'Au Tout-Atout, peut-on couper avec une autre couleur ?',
      opts: ['Oui, toujours', 'Non, toutes les couleurs sont atout', 'Oui, si le partenaire est maître', 'Uniquement au dernier pli'],
      a: 1,
      why: 'Au Tout-Atout toutes les cartes sont des atouts : il est impossible de couper, mais il faut monter sur la carte maître.',
    },
    {
      q: 'En Sans-Atout, quelle est la carte la plus forte ?',
      opts: ['Le Valet', 'Le 9', 'L’As', 'Le 10'],
      a: 2,
      why: 'En Sans-Atout seules les valeurs ordinaires comptent : l’As est la plus forte (A · 10 · R · D · V · 9 · 8 · 7).',
    },
    {
      q: 'Combien de « bon » faut-il pour fixer un appel de Pique (couleur classique) ?',
      opts: ['1', '2', '3', '4'],
      a: 2,
      why: 'Pique, Cœur, Carreau et Tout-Atout demandent trois « bon » consécutifs. Sans-Atout et Trèfle se ferment avec un seul « bon ».',
    },
    {
      q: 'Le preneur chute en Sans-Atout. Qui remporte les 52 dizaines ?',
      opts: ['Personne', 'Le preneur', 'L’équipe adverse', 'Les dizaines sont réparties'],
      a: 2,
      why: '« Tout ou rien » : si le preneur chute (maty), l’équipe adverse récupère la totalité des 52 dizaines.',
    },
    {
      q: 'Vous n’avez pas la couleur demandée et votre partenaire est maître du pli. Que pouvez-vous faire ?',
      opts: ['Couper obligatoirement', 'Monter obligatoirement', '« Pisser » une carte inutile', 'Renoncer au pli'],
      a: 2,
      why: 'Règle « miboty » : si le partenaire est maître, on n’est pas obligé de couper — on peut se défausser d’une carte inutile.',
    },
    {
      q: 'Un contre multiplie les dizaines en jeu par…',
      opts: ['1', '2', '3', '4'],
      a: 1,
      why: 'Contre = ×2 ; le surcontre (possible sauf Trèfle et Sans-Atout) monte à ×4.',
    },
    {
      q: 'Qui peut contrer un appel ?',
      opts: ['Le partenaire de l’appelant', 'Un adversaire de l’équipe appelante', 'N’importe qui, à tout moment', 'Personne avant trois « bon »'],
      a: 1,
      why: 'Le contre vient de l’équipe adverse : le partenaire de l’appelant ne peut pas contrer son propre camp (il répond par « bon », un appel SA/TA, puis « surcontre » si son camp a été contré).',
    },
    {
      q: 'En Tout-Atout réussi, comment se répartissent les 26 dizaines ?',
      opts: ['Tout au preneur', 'Tout à la défense', 'Selon les points arrondis de chaque équipe', 'Également : 13 et 13'],
      a: 2,
      why: 'Chaque équipe marque ses dizaines (points arrondis, l’équipe du dix de der étant comptée en premier) ; la somme donne les 26 dizaines.',
    },
  ];

  // ─────────────────────────────────────────────────────────────── tips ──

  const TIPS = [
    ['Comptez les atouts', 'Il y a 8 atouts dans le jeu. Avec 4 atouts ou plus en main (dont idéalement le Valet ou le 9), vous tenez une bonne base pour prendre. En dessous de 3, méfiez-vous.'],
    ['Le Valet et le 9 valent de l’or', 'À eux deux, J + 9 d’atout représentent 34 points et la maîtrise de la couleur. Ce sont vos cartes de contrôle : ne les gaspillez pas dans des plis sans enjeu.'],
    ['Enchères : ne surenchérissez pas votre partenaire', 'Vous jouez en équipe : si votre partenaire tient déjà le contrat, passer laisse l’équipe tranquille. Le Trèfle (64 dz) et le Sans-Atout (52 dz) sont des paris risqués, réservez-les aux mains exceptionnelles.'],
    ['Contrez avec discernement', 'Ne contrez que si votre camp détient clairement la main (beaucoup d’atouts et d’As). Un contre inutile double la mise… et la perte en cas de réussite adverse.'],
    ['Au Tout-Atout, montez toujours', 'Toutes les couleurs sont atout et on ne peut pas couper : dès que vous pouvez monter sur la carte maître, faites-le. Vos Valets et 9 (de n’importe quelle couleur) sont les maîtres du jeu.'],
    ['Au Sans-Atout, sortez vos As et 10 tôt', 'Sans atout, l’As puis le 10 dominent chaque couleur. En entame, jouez vos As (et 10) pour engranger des points avant que la couleur ne soit coupée par un défaussage.'],
    ['Souvenez-vous du dix de der', 'Le dernier pli vaut 10 points — autant qu’un As. En fin de manche, si la main est tenue par votre équipe, gardez un atout maître (ou un As) pour le récupérer.'],
    ['« Miboty » malin', 'Ne coupez pas bêtement quand votre partenaire est maître : « pissez » une carte inutile pour préserver vos atouts. En revanche, coupez et surcoupez sans hésiter quand un adversaire tient le pli.'],
    ['Pensez en dizaines', 'Le but est d’atteindre 150 dizaines, pas de gagner tous les plis : une manche en couleur rapporte 16 dizaines au vainqueur, 0 au perdant. Mieux vaut une petite couleur sûre qu’un Trèfle aventureux.'],
    ['La défense : faites chuter', 'En défense, votre objectif est simple : que le preneur n’obtienne pas plus de points que vous. Coupez ses maîtres, évitez de lui donner des points, et contrôlez la fin de manche pour viser le dix de der.'],
  ];

  // ─────────────────────────────────────────────────────────────── render ──

  function rulesHTML() {
    const sections = RULES.map((s) =>
      '<section class="learn-sec"><h3>' + s.h + '</h3>' + s.body + '</section>').join('');
    return '<div class="learn-rules">' + sections + '</div>';
  }

  function tipsHTML() {
    const cards = TIPS.map(([t, d]) =>
      '<article class="tip-card"><h3>💡 ' + t + '</h3><p>' + d + '</p></article>').join('');
    return '<div class="tip-grid">' + cards + '</div>';
  }

  // quiz state
  let qi = 0, correct = 0, answered = false;

  function quizHTML() {
    const q = QUIZ[qi];
    const opts = q.opts.map((o, i) =>
      '<button class="quiz-opt" data-i="' + i + '">' + esc(o) + '</button>').join('');
    return (
      '<div class="quiz" data-q="' + qi + '">' +
      '<div class="quiz-progress">Question ' + (qi + 1) + ' / ' + QUIZ.length +
      ' · score ' + correct + '</div>' +
      '<div class="quiz-q"><b>' + esc(q.q) + '</b></div>' +
      '<div class="quiz-opts">' + opts + '</div>' +
      '<div class="quiz-why" hidden></div>' +
      '<div class="quiz-nav">' +
      (qi > 0 ? '<button class="ghost-btn" data-nav="prev">← Précédente</button>' : '') +
      (qi < QUIZ.length - 1 ? '<button class="big-btn primary" data-nav="next" hidden>Suivante →</button>'
        : '<button class="big-btn primary" data-nav="done" hidden>Voir mon score</button>') +
      '<button class="ghost-btn" data-nav="restart" hidden>Recommencer</button>' +
      '</div></div>'
    );
  }

  function render(tab) {
    const body = $('#learnBody');
    if (tab === 'quiz') { qi = 0; correct = 0; answered = false; body.innerHTML = quizHTML(); }
    else if (tab === 'tips') body.innerHTML = tipsHTML();
    else body.innerHTML = rulesHTML();
  }

  function onQuizClick(e) {
    const t = e.target;
    if (!t.closest || !t.closest('.quiz')) return;
    if (t.classList.contains('quiz-opt')) {
      if (answered) return;
      answered = true;
      const q = QUIZ[qi];
      const i = +t.dataset.i;
      const opts = $$('.quiz-opt');
      opts.forEach((b, j) => {
        b.disabled = true;
        if (j === q.a) b.classList.add('ok');
        else if (j === i) b.classList.add('bad');
      });
      if (i === q.a) correct++;
      const why = $('.quiz-why');
      why.hidden = false;
      why.innerHTML = (i === q.a ? '✅ <b>Bonne réponse !</b> ' : '❌ <b>Pas tout à fait.</b> ') + esc(q.why);
      const next = $('[data-nav="next"]'), done = $('[data-nav="done"]');
      if (next) next.hidden = false;
      if (done) done.hidden = false;
    } else if (t.dataset && t.dataset.nav) {
      const nav = t.dataset.nav;
      if (nav === 'next') { qi++; answered = false; $('#learnBody').innerHTML = quizHTML(); }
      else if (nav === 'prev') { qi--; answered = false; $('#learnBody').innerHTML = quizHTML(); }
      else if (nav === 'restart') { qi = 0; correct = 0; answered = false; $('#learnBody').innerHTML = quizHTML(); }
      else if (nav === 'done') {
        const score = correct;
        $('#learnBody').innerHTML =
          '<div class="quiz-done">' +
          '<div class="quiz-done-score">' + score + ' / ' + QUIZ.length + '</div>' +
          '<h3>' + (score === QUIZ.length ? 'Parfait ! Vous maîtrisez la Bélote Gasy 🏆' :
            score >= QUIZ.length * 0.7 ? 'Très bien, encore un petit effort ! 👍' :
            score >= QUIZ.length * 0.5 ? 'Pas mal — relisez les règles et retentez. 📖' :
            'Reprenez la lecture des règles, puis retentez le quiz. 📚') + '</h3>' +
          '<button class="big-btn primary" data-nav="restart">Recommencer le quiz</button>' +
          '</div>';
        answered = false;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────── api ──

  function init() {
    const tabs = $$('#learnTabs .learn-tab');
    tabs.forEach((t) => t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('active', x === t));
      render(t.dataset.tab);
    }));
    document.addEventListener('click', onQuizClick);
  }

  function open() { render('rules'); }

  // small helpers (kept local to avoid depending on game.js)
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  w.Learn = { init, open };
})(window);
