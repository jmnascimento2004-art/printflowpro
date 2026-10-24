# Chat: tema canônico do tenant

Refinamento visual posterior à Fase 11F, sem mudança em APIs, tokens, Realtime, permissões ou banco. O widget deixa de resolver uma paleta própria; header, launcher, filtros, badges, envio e bubbles de visitante consomem `--primary` e `--primary-foreground` publicados por `CompanyThemeSync`. Agente e sistema usam superfícies neutras dos tokens globais; modo escuro acompanha as mesmas variáveis. WhatsApp conserva sua integração e identidade existentes.

Os controles reutilizam `pf-button-primary`, `pf-button-secondary`, `pf-input` e `pf-textarea`. A primitive primária passa a respeitar o foreground calculado, em vez de presumir branco. Hover usa sombra derivada da primary sem reduzir o contraste da cor de fundo. Inputs mantêm ring primary e ganham indicador de foco neutro contrastante, inclusive com primárias muito claras. Botão de fechar no header usa o contraste da primary.

O helper existente `getContrastingTextColor` usa luminância sRGB linear e razão WCAG, escolhendo o foreground global slate, branco ou preto para alcançar AA. `CompanyThemeSync` reutiliza esse helper e mantém precisão HSL, evitando perder contraste por arredondamento. Cores ausentes/inválidas retornam ao fallback oficial; alterações no objeto company atualizam os tokens pelo efeito já existente. Nenhuma configuração específica de Chat é criada.

Cobertura: anti-regressão de branding hardcoded apenas nos arquivos Chat, preservando warning/error; contraste em 4.913 cores, incluindo a saída HSL final; troca A→B→A e fallback no componente real de sincronização com fronteiras externas substituídas. Validações de Preview, responsividade, alteração via Configurações e publicação são gates separados e não presumidos por esses testes.
