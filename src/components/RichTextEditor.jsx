import { useEffect, useRef } from 'react'

export function RichTextEditor({ value, onChange, placeholder }) {
  const ref = useRef(null)
  const lastValue = useRef(undefined)

  useEffect(() => {
    if (!ref.current) return
    if (document.activeElement === ref.current) return
    if (value !== lastValue.current) {
      ref.current.innerHTML = value || ''
      lastValue.current = value
    }
  }, [value])

  function exec(command, arg = null) {
    document.execCommand(command, false, arg)
    if (ref.current) {
      lastValue.current = ref.current.innerHTML
      onChange?.(ref.current.innerHTML)
    }
  }

  function handleInput() {
    if (!ref.current) return
    lastValue.current = ref.current.innerHTML
    onChange?.(ref.current.innerHTML)
  }

  return (
    <div className="rich-editor">
      <div className="rich-toolbar" role="toolbar">
        <button
          type="button"
          className="rich-tool"
          title="Negrita"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('bold')
          }}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className="rich-tool"
          title="Cursiva"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('italic')
          }}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          className="rich-tool"
          title="Subrayado"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('underline')
          }}
        >
          <u>U</u>
        </button>
        <span className="rich-separator" />
        <button
          type="button"
          className="rich-tool"
          title="Título 2"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('formatBlock', 'h3')
          }}
        >
          H2
        </button>
        <button
          type="button"
          className="rich-tool"
          title="Título 3"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('formatBlock', 'h4')
          }}
        >
          H3
        </button>
        <button
          type="button"
          className="rich-tool"
          title="Párrafo normal"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('formatBlock', 'p')
          }}
        >
          P
        </button>
        <span className="rich-separator" />
        <button
          type="button"
          className="rich-tool"
          title="Lista con viñetas"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('insertUnorderedList')
          }}
        >
          •
        </button>
        <button
          type="button"
          className="rich-tool"
          title="Lista numerada"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('insertOrderedList')
          }}
        >
          1.
        </button>
        <button
          type="button"
          className="rich-tool"
          title="Aumentar sangría"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('indent')
          }}
        >
          →
        </button>
        <button
          type="button"
          className="rich-tool"
          title="Disminuir sangría"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('outdent')
          }}
        >
          ←
        </button>
        <button
          type="button"
          className="rich-tool"
          title="Quitar formato"
          onMouseDown={(event) => {
            event.preventDefault()
            exec('removeFormat')
          }}
        >
          Tx
        </button>
      </div>
      <div
        ref={ref}
        className="rich-content"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
      />
    </div>
  )
}