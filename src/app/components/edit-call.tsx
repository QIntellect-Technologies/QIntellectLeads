import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api, useApiMutation } from '../lib/api'
import { CALL_DIRECTIONS, CALL_RESULTS, dmyTime } from '../../shared/leads'
import type { CallRow } from '../../shared/types'
import { Button, Dialog, Field, Input, Select, Textarea, useToast } from './ui'

/** Edits the call fields that are safe to correct without rewriting the lead timeline. */
export function EditCallDialog({ call, onClose }: { call: CallRow | null; onClose: () => void }) {
  const toast = useToast()
  const [result, setResult] = useState('Unknown')
  const [direction, setDirection] = useState('Unknown')
  const [contactName, setContactName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!call) return
    setResult(call.result)
    setDirection(call.direction)
    setContactName(call.contactName ?? '')
    setPhoneNumber(call.phoneNumber ?? '')
    setNote(call.note ?? '')
  }, [call])

  const save = useApiMutation(
    () =>
      api(`/calls/${call?.id}`, {
        method: 'PATCH',
        json: {
          callResult: result,
          callDirection: direction,
          contactName: contactName.trim() || null,
          phoneNumber: phoneNumber.trim() || null,
          note: note.trim() || null,
        },
      }),
    ['calls', 'call', 'number-directory', 'lead', 'leads'],
    {
      onSuccess: () => {
        toast('Call updated')
        onClose()
      },
    },
  )

  return (
    <Dialog
      open={Boolean(call)}
      onClose={onClose}
      title="Edit call"
      description={call ? `${call.lead.code} · ${dmyTime(call.date)}` : undefined}
      width={520}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!call}>
            <Pencil />
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Call result">
            <Select value={result} onChange={(e) => setResult(e.target.value)}>
              {CALL_RESULTS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
              {CALL_DIRECTIONS.map((item) => (
                <option key={item}>{item}</option>
              ))}
              <option value="Unknown">Unknown</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Person">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Person on the call" />
          </Field>
          <Field label="Number">
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="0300 4561201" />
          </Field>
        </div>
        <Field label="Notes" hint="What was discussed or agreed?">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Call notes..." />
        </Field>
        {save.error && <p className="text-[13px] text-danger">{save.error.message}</p>}
      </div>
    </Dialog>
  )
}
