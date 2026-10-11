export type BoardJob = {closed:string[]; room:string; round:number; move:number; revision:number};
export type BoardReply = {closed:string[];version:number;automatic_guess?:{correct:boolean}};
export class BoardQueue {
  private jobs:BoardJob[]=[];
  private running=false;
  private cancelled=false;
  private waiters:(()=>void)[]=[];
  constructor(private send:(job:BoardJob)=>Promise<BoardReply>,private saved:(reply:BoardReply,latest:boolean)=>void,private failed:()=>void,private idle:()=>Promise<void>){}
  enqueue(job:BoardJob){if(this.cancelled)return;this.jobs.push({...job,closed:[...job.closed]});void this.pump();}
  get queued(){return this.jobs.length>0;}
  cancel(){this.cancelled=true;this.jobs=[];}
  flush(){return this.running||this.jobs.length?new Promise<void>(resolve=>this.waiters.push(resolve)):Promise.resolve();}
  private async pump(){
    if(this.running)return;this.running=true;
    try{
      while(this.jobs.length&&!this.cancelled){
        const reply=await this.send(this.jobs.shift()!);
        if(this.cancelled)break;
        if(reply.automatic_guess)this.jobs=[];
        this.saved(reply,this.jobs.length===0);
      }
    }catch{this.jobs=[];if(!this.cancelled)this.failed();}
    finally{
      if(!this.cancelled)await this.idle();
      this.running=false;
      if(this.jobs.length&&!this.cancelled)void this.pump();
      else this.waiters.splice(0).forEach(resolve=>resolve());
    }
  }
}
