# Análise Completa do Projeto — Bugs, Erros, Dead Code e Problemas

> Gerado em: 21 de maio de 2026
> Projeto: Fiado Mobile (apps/mobile)

---

## 🐛 BUGS & ERROS LÓGICOS

### 1. Hardcoded IP de desenvolvimento
- **Arquivo:** `app/(auth)/login.tsx`
- **Problema:** O IP `192.168.1.104` está hardcoded para redirecionamento OAuth em dev. Esse IP é específico da rede do desenvolvedor e não funcionará em outra rede ou em produção.
- **Impacto:** O login com Google/Facebook via OAuth pode quebrar em outras máquinas.
- **Trecho:**
  ```typescript
  if (__DEV__ && Platform.OS !== 'web' && redirectTo.includes('localhost')) {
    redirectTo = redirectTo.replace('localhost', '192.168.1.104');
  }
  ```

### 2. `isGoogleNativeEnabled()` — `require()` sem try/catch
- **Arquivo:** `src/auth/googleNative.ts`
- **Problema:** A função usa `require('@react-native-google-signin/google-signin')` fora de um bloco try/catch. Se o módulo nativo não estiver instalado/buildado, isso lançará um erro fatal em runtime.
- **Impacto:** Crash se o Google Sign-In nativo não estiver configurado (ex.: iOS sem o pod instalado).

### 3. Redirecionamento circular potencial em `[id].tsx`
- **Arquivo:** `app/(tabs)/clientes/[id].tsx`
- **Problema:** Se `customerIdMap` retornar um ID diferente que também não existe no array `customers`, o `useEffect` vai executar `router.replace()` repetidamente, criando um loop infinito.
- **Impacto:** Travamento do app em casos de dados corrompidos no estado.
- **Trecho:**
  ```typescript
  useEffect(() => {
    if (!id) return;
    if (customer) return;
    const mapped = customerIdMap?.[String(id)];
    if (mapped) {
      router.replace(`/clientes/${mapped}`);
    }
  }, [id, customer, customerIdMap, router]);
  ```

### 4. Duas funções de WhatsApp — propenso a divergência
- **Arquivos:** `app/(tabs)/pagamentos.tsx` (usa `sendWhatsappReceipt`), `app/(tabs)/clientes/[id].tsx` (usa `sendWhatsappReminder`)
- **Problema:** Duas funções com propósitos semelhantes em `src/utils/index.ts`. Se uma for alterada, a outra pode ficar desatualizada, criando bugs de manutenção.

### 5. Dependência frágil do `react-native-iap`
- **Arquivo:** `app/(tabs)/subscription.native.tsx`
- **Problema:** Uso de `require()` dinâmico para carregar `react-native-iap`, que pode não estar disponível em todos os builds (especialmente em iOS se não configurado).
- **Impacto:** Pode lançar erro em runtime se o módulo não estiver instalado.

---

## 🗺️ PÁGINAS MORTAS / ROTAS INACESSÍVEIS

### 6. `AnimatedPopup` — Componente importado mas NUNCA usado
- **Importado em:** `app/(tabs)/clientes/index.tsx`
- **Problema:** O componente `AnimatedPopup` é importado (`import { Header, Button, CustomerRow, AnimatedPopup }`) mas não é renderizado no JSX. É import morto.

### 7. `NovoClientePopup` e `NovoFiadoPopup` — Componentes mortos
- **Arquivos:** `src/components/NovoClientePopup.tsx`, `src/components/NovoFiadoPopup.tsx`
- **Exportados de:** `src/components/index.ts`
- **Problema:** NENHUM arquivo no projeto importa esses componentes. Eles existem, são exportados, mas nunca usados em lugar nenhum.
- **Impacto:** ~300 linhas de código morto. Provavelmente substituídos por navegação para páginas dedicadas (`/clientes/novo` e `/novo-fiado`).

---

## ⚠️ AVISOS DE CÓDIGO (WARNINGS)

### 8. `FadeInRight` e `FadeInDown` com delay/duration zero
- **Arquivo:** `app/(tabs)/home.tsx` (várias linhas)
- **Problema:** Todas as animações usam `delay(0).duration(0)`, o que torna o componente de animação inútil — a entrada já acontece instantaneamente.
- **Impacto:** Código confuso que pode dar a impressão de que animações estão sendo feitas, mas na verdade são no-ops.
- **Exemplo:**
  ```typescript
  entering={FadeInDown.delay(0).duration(0)}  // Essencialmente inútil
  ```

### 9. `deleteCustomer` importado mas não usado em `clientes/index.tsx`
- **Arquivo:** `app/(tabs)/clientes/index.tsx`
- **Problema:** `deleteCustomer` é desestruturado do store, mas nunca é chamado nesse arquivo (a deleção só acontece em `[id].tsx`).

### 10. Artefatos de edição (linhas em branco extras)
- **Arquivo:** `app/(tabs)/clientes/index.tsx` (linhas 28-29, 65-66)
- **Problema:** Linhas em branco extras que parecem artefatos de edição.

---

## 🔗 LINKS ESTÁTICOS (HARDCODED)

| Arquivo | URL | Problema |
|---------|-----|----------|
| `app/(auth)/login.tsx` | `192.168.1.104` (hardcoded) | ⚠️ IP fixo de rede local |
| `src/utils/index.ts` | `https://viacep.com.br/ws/${cleanCep}/json/` | ✅ API pública (ok) |
| `src/auth/googleNative.ts` | Constantes de config do Google Sign-In | ✅ Dependente de config nativa (ok) |

---

## ✅ TYPE CHECKS

O TypeScript (`npx tsc --noEmit`) passou **sem erros** na última verificação.

---

## 📋 RESUMO DOS PROBLEMAS PRIORITÁRIOS

| Prioridade | Problema | Ação recomendada |
|---|---|---|
| 🔴 Alta | IP hardcoded (`192.168.1.104`) | Tornar configurável via `.env` |
| 🔴 Alta | `isGoogleNativeEnabled` com `require()` sem try/catch | Envolver em try/catch |
| 🟡 Média | Potencial redirect infinito em `[id].tsx` | Adicionar proteção anti-loop |
| 🟡 Média | Animações com delay/duration = 0 | Remover ou configurar corretamente |
| 🟢 Baixa | `AnimatedPopup`, `NovoClientePopup`, `NovoFiadoPopup` mortos | Remover código morto |
| 🟢 Baixa | `deleteCustomer` import não usado em `clientes/index.tsx` | Remover import não usado |
| 🟢 Baixa | Duas funções de WhatsApp similares | Unificar em uma só |
