/* Visual controls only. Source HTML/Markdown is storage, never an editor mode. */
(() => {
  const {CMS, createClass, h, tinymce, DOMPurify, marked} = window;
  const plain = value => value?.toJS ? value.toJS() : value;
  const safeURL = value => /^(?:https?:\/\/|\/[^/]|blob:|mailto:|tel:)/i.test(String(value || '')) ? String(value) : '';
  const html = value => DOMPurify.sanitize(marked.parse(String(value || ''), {breaks: true}), {
    ADD_TAGS: ['iframe'], ADD_ATTR: ['loading', 'allowfullscreen'], FORBID_TAGS: ['style', 'script', 'form', 'input']
  });
  const media = (props, value) => {
    if (!value) return '';
    try {return safeURL(String(props.getAsset(value)));} catch {return safeURL(value);}
  };
  const contentHTML = (props, value) => {
    const doc = new DOMParser().parseFromString(html(value), 'text/html');
    doc.querySelectorAll('img').forEach(img => img.setAttribute('src', media(props, img.getAttribute('src'))));
    doc.querySelectorAll('iframe').forEach(frame => {
      if (!/^https:\/\/(?:drive\.google\.com|docs\.google\.com|www\.youtube-nocookie\.com)\//.test(frame.src)) frame.remove();
    });
    return doc.body.innerHTML;
  };
  const VisualControl = createClass({
    componentDidMount() {
      this.lastValue = String(this.props.value || '');
      this.mounted = true;
      tinymce.init({
        target: this.input, base_url: '/admin/vendor/tinymce', suffix: '.min', license_key: 'gpl',
        language: 'uk', language_url: '/admin/vendor/tinymce/langs/uk.js',
        plugins: 'lists link table', menubar: false, branding: false, promotion: false,
        table_advtab:false, table_row_advtab:false, table_cell_advtab:false,
        toolbar: 'undo redo | blocks | bold italic | bullist numlist | link table | removeformat',
        block_formats: 'Абзац=p;Заголовок 2=h2;Заголовок 3=h3;Заголовок 4=h4',
        height: 540, resize: true, statusbar: false, paste_data_images: false, noneditable_class:'cms-component',
        content_style: 'body{font:16px/1.7 Arial,sans-serif;color:#172c3a;max-width:850px;margin:24px auto;padding:0 18px}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d6e0e5;padding:10px}a{color:#176a9a}',
        extended_valid_elements: 'iframe[src|title|width|height|loading|allowfullscreen],details[open|class],summary[class],svg[*],path[*],circle[*],rect[*],line[*],polyline[*],polygon[*],g[*]',
        setup: editor => {
          editor.on('init', () => {
            if (!this.mounted) {editor.remove(); return;}
            this.editor = editor;
            editor.setContent(html(this.props.value));
          });
          editor.on('input change undo redo blur', () => {
            if (!this.editor) return;
            const value = editor.getContent();
            if (value !== this.lastValue) {this.lastValue = value; this.props.onChange(value);}
          });
        }
      }).catch(() => {if (this.mounted) this.setState({failed: true});});
    },
    componentDidUpdate() {
      const value = String(this.props.value || '');
      if (this.editor && value !== this.lastValue) {this.lastValue = value; this.editor.setContent(html(value));}
    },
    componentWillUnmount() {this.mounted = false; this.editor?.remove();},
    render() {
      return h('div', {className: 'visual-control'},
        h('textarea', {id: this.props.forID, ref: node => {this.input = node;}}),
        this.state?.failed ? h('p', {role:'alert'}, 'Не вдалося відкрити редактор. Онови сторінку; матеріал збережено.') : null);
    }
  });
  const VisualPreview = ({value}) => h('div', {className: 'preview-prose', dangerouslySetInnerHTML: {__html: html(value)}});
  CMS.registerWidget('visual', VisualControl, VisualPreview);
  CMS.registerPreviewStyle('/admin/preview.css?v=' + window.CMS_ASSET_VERSION);

  function photo(props, src, alt = '') {
    return src ? h('img', {src: media(props, src), alt, loading: 'lazy'}) : null;
  }
  const PreviewGallery = createClass({
    getInitialState() {return {index:0};},
    render() {
      const images = this.props.images || [];
      if (!images.length) return null;
      const index = this.state.index % images.length;
      const item = images[index], image = typeof item === 'string' ? {src:item} : item;
      const step = direction => this.setState({index:(index + direction + images.length) % images.length});
      return h('div', {className:'preview-gallery'}, photo(this.props.assetProps, image.src, image.alt),
        images.length > 1 ? h('div', {className:'preview-gallery-controls'},
          h('button', {type:'button', 'aria-label':'Попереднє фото', onClick:()=>step(-1)}, '‹'),
          h('span', {}, (index + 1) + ' / ' + images.length),
          h('button', {type:'button', 'aria-label':'Наступне фото', onClick:()=>step(1)}, '›')) : null);
    }
  });
  function blocks(props, items = []) {
    return items.map((item, index) => {
      switch(item.type) {
        case 'image': return h('figure', {key:index}, photo(props, item.src, item.caption), h('figcaption', {}, item.caption));
        case 'gallery': return h(PreviewGallery, {key:index, assetProps:props, images:item.images});
        case 'heading': return h('h' + ([2,3,4].includes(Number(item.level)) ? item.level : 2), {key:index}, item.value);
        case 'quote': return h('blockquote', {key:index}, item.value);
        case 'link': return h('p', {key:index}, h('a', {href:safeURL(item.url)}, item.label));
        case 'list': return h(item.style === 'ordered' ? 'ol' : 'ul', {key:index}, ...(item.items || []).map((text, i) => h('li', {key:i}, text)));
        default: return h('p', {key:index}, item.value);
      }
    });
  }
  const ArticlePreview = createClass({render() {
    const data = plain(this.props.entry.get('data'));
    return h('article', {className:'fkbad-preview'}, h('p', {className:'preview-meta'}, data.category),
      /class="[^"]*page-heading/.test(data.body || '') ? null : h('h1', {}, data.title), photo(this.props, data.featured_image, data.title),
      h('div', {className:'preview-prose', dangerouslySetInnerHTML:{__html:contentHTML(this.props, data.body)}}),
      ...blocks(this.props, data.content_blocks));
  }});
  CMS.registerPreviewTemplate('news', ArticlePreview);
  CMS.registerPreviewTemplate('pages', ArticlePreview);

  const LibraryPreview = createClass({
    getInitialState() {return {section:'home'};},
    render() {
      const data = plain(this.props.entry.get('data')), intro = data.intro || {}, sections = data.pages || {};
      const key = this.state.section, section = sections[key] || {};
      const books = (section.books || []).map((book, index) => h('article', {key:'book-'+index, className:'preview-book'},
        photo(this.props, book.cover, book.alt || book.title), h('div', {}, h('small', {}, book.code), h('h3', {}, book.title),
          h('p', {}, book.description), h('details', {}, h('summary', {}, 'Бібліографічний опис'), h('p', {}, book.citation)))));
      const stories = key === 'home' ? (data.stories || []).map((story, index) => h('article', {key:'story-'+index, className:'preview-story'},
        h('div', {}, h('h2', {}, story.title), h('p', {}, story.text)),
        h(PreviewGallery, {assetProps:this.props, images:story.images}))) : [];
      const files = [...(section.files || []).map(item => ({title:item.label, url:item.url})), ...(data.documents || []).filter(item => item.section === key)];
      return h('article', {className:'fkbad-preview preview-library'}, h('h1', {}, intro.title), h('p', {}, intro.lead),
        h('section', {className:'preview-intro'}, h('h2', {}, intro.heading), h('p', {}, intro.description),
          h('strong', {}, String((sections.arrivals?.books || []).length) + ' нових видань')),
        h('nav', {className:'preview-tabs', 'aria-label':'Розділи бібліотеки'}, ...Object.keys(sections).map(id => h('button', {
          key:id, type:'button', 'aria-pressed':key === id, onClick:() => this.setState({section:id})}, sections[id].title || id))),
        h('h2', {}, section.title), h('p', {}, section.description || (key === 'home' ? intro.about_description : '')),
        ...stories, ...(section.blocks || []).map((text,index) => h('p', {key:'paragraph-'+index}, text)),
        h(PreviewGallery, {key:'gallery-'+key, assetProps:this.props, images:section.images}),
        ...books, ...files.map((file,index) => h('details', {key:'file-'+index}, h('summary', {}, file.title),
          h('a', {href:media(this.props, file.url), target:'_blank', rel:'noopener'}, 'Переглянути документ'))));
    }
  });
  CMS.registerPreviewTemplate('library_content', LibraryPreview);
  CMS.registerPreviewTemplate('documents', createClass({render() {
    const data = plain(this.props.entry.get('data'));
    return h('article', {className:'fkbad-preview'}, h('p', {}, data.category), h('h1', {}, data.title),
      h('a', {href:media(this.props, data.file || data.url)}, 'Переглянути документ'));
  }}));
  CMS.registerPreviewTemplate('general', createClass({render() {
    const data = plain(this.props.entry.get('data'));
    return h('article', {className:'fkbad-preview'}, h('h1', {}, 'Контакти коледжу'),
      ...['phone_primary','phone_secondary','phone_third','email','address'].map(key => h('p', {key}, data[key])),
      h('p', {}, data.footer_signature), h('p', {}, data.footer_slogan));
  }}));
  CMS.registerPreviewTemplate('homepage', createClass({render() {
    const data = plain(this.props.entry.get('data'));
    return h('article', {className:'fkbad-preview preview-home'},
      h('section', {className:'preview-home-hero', style:{backgroundImage:'linear-gradient(#0b1e4380,#0b1e43b0),url("'+media(this.props,data.background)+'")'}},
        h('h1', {}, ...(data.headline_lines || []).map((line,index)=>h('span',{key:index},line))),
        h('p',{},data.college_name), h('nav', {}, ...(data.buttons || []).map((item,index)=>h('a',{key:index,href:safeURL(item.url)},item.label)))),
      h('nav',{className:'preview-home-links'},...(data.quick_links || []).map((item,index)=>h('a',{key:index,href:safeURL(item.url)},h('strong',{},item.title),h('small',{},item.subtitle)))),
      h('p', {}, 'Останні новини: '+data.news_count+' публікацій, оновлюються автоматично.'));
  }}));
  CMS.init();
})();
