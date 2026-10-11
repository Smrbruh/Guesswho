import {test,expect,vi} from 'vitest';
import {BoardQueue,type BoardJob,type BoardReply} from '../src/lib/boardQueue';
const job=(closed:string[]):BoardJob=>({closed,room:'room',round:1,move:0,revision:0});
const deferred=()=>{let resolve!:(value:BoardReply)=>void;const promise=new Promise<BoardReply>(r=>resolve=r);return{promise,resolve};};
test('rapid clicks are saved sequentially without dropping cards or overwriting later optimistic changes',async()=>{
 const gates=[deferred(),deferred(),deferred()],sent:BoardJob[]=[],saved=vi.fn(),failed=vi.fn();
 const queue=new BoardQueue(async value=>{sent.push(value);return gates[sent.length-1].promise;},saved,failed,async()=>{});
 queue.enqueue(job(['a']));queue.enqueue(job(['a','b']));queue.enqueue(job(['a','b','c']));const done=queue.flush();expect(sent).toHaveLength(1);
 gates[0].resolve({closed:['a'],version:1});await vi.waitFor(()=>expect(sent).toHaveLength(2));expect(saved.mock.calls[0][1]).toBe(false);
 gates[1].resolve({closed:['a','b'],version:2});await vi.waitFor(()=>expect(sent).toHaveLength(3));
 gates[2].resolve({closed:['a','b','c'],version:3});await done;expect(saved.mock.calls[2][1]).toBe(true);expect(failed).not.toHaveBeenCalled();
});
test('automatic guesses discard later queued changes and failures stop the queue for resynchronization',async()=>{
 const gate=deferred(),send=vi.fn(()=>gate.promise),saved=vi.fn(),failed=vi.fn();const queue=new BoardQueue(send,saved,failed,async()=>{});
 queue.enqueue(job(['a']));queue.enqueue(job(['a','b']));const done=queue.flush();gate.resolve({closed:['a'],version:1,automatic_guess:{correct:true}});await done;expect(send).toHaveBeenCalledTimes(1);
 const bad=new BoardQueue(async()=>{throw Error('network');},saved,failed,async()=>{});bad.enqueue(job(['a']));bad.enqueue(job(['a','b']));await bad.flush();expect(failed).toHaveBeenCalledOnce();
});
test('flush waits for edits added while the server snapshot is being refreshed',async()=>{
 let finish!:()=>void;const idle=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>finish=resolve)).mockResolvedValue(undefined);const send=vi.fn(async value=>({closed:value.closed,version:1}));const queue=new BoardQueue(send,()=>{},()=>{},idle);
 queue.enqueue(job(['a']));await vi.waitFor(()=>expect(idle).toHaveBeenCalledOnce());queue.enqueue(job(['a','b']));let done=false;const flush=queue.flush().then(()=>done=true);expect(done).toBe(false);finish();await flush;expect(send).toHaveBeenCalledTimes(2);
});
