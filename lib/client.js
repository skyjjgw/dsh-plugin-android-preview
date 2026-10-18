window.__ModuleLoader__.load({
  id: 'dsh-plugin-android-preview',
  factory(require) {
    const React = require('react'), h = React.createElement;
    const ID = 'dsh-plugin-android-preview', KIND = 'android-preview';
    const panelStyle = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--dsw-alias-bg-base)' };
    function Body() {
      const [info, setInfo] = React.useState(null);
      const [revision, setRevision] = React.useState(0);
      React.useEffect(() => {
        const controller = new AbortController();
        fetch('/api/android-preview/info', { signal: controller.signal }).then(async response => {
          if (!response.ok) throw Error(`插件服务不可用 (${response.status})`);
          return response.json();
        }).then(setInfo).catch(error => { if (!controller.signal.aborted) setInfo({ error: error.message }); });
        return () => controller.abort();
      }, [revision]);
      if (!info || info.error) return h('div', { style: { padding: 20 } }, h('p', null, info?.error ?? '正在连接手机预览插件…'), h('p', null, '首次使用请在插件配置里指定项目、adb.exe 和 scrcpy-server 路径。'), h('button', { onClick: () => setRevision(n => n + 1) }, '重新连接'));
      let url;
      try { url = new URL(info.url); if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error(); }
      catch { return h('p', { style: { padding: 20 } }, '预览服务返回了无效地址'); }
      return h('div', { style: panelStyle }, h('iframe', { title: 'Android 实时预览', src: url.href, sandbox: 'allow-scripts allow-same-origin', style: { border: 0, width: '100%', flex: 1, minHeight: 0 } }));
    }
    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => ctx.sidebarRightTabs.register({ id: ID, kind: KIND, title: () => '手机预览', keepMounted: true, guide: [{ id: 'open', order: 40, title: () => '手机预览', description: () => '真实 Android App 与 Flutter 热重载' }] }), 'android-preview: tab type');
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID }, Body));
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: ID, order: 80, inject: () => ({ open: () => ctx.sidebarRight.openTab(KIND) }) }, ({ open }) => h('button', { type: 'button', onClick: open, title: '打开真实 Android App 预览', style: { cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '5px 9px', background: 'var(--dsw-alias-bg-layer-1)', color: 'inherit', fontSize: 12 } }, '手机预览')));
      },
    };
  },
});
