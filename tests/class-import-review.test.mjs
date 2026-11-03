import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const window={};
for(const file of ['../SITE/bolt-class-import.js','../SITE/Boltclass/grade-review.js']){
 vm.runInNewContext(readFileSync(new URL(file,import.meta.url),'utf8'),{window,structuredClone});
}

test('import joins school tables and skips duplicates on a retry',()=>{
 const bundle={client:{id:'school-a',slug:'escola-a',name:'Escola A'},data:null};
 const sheets={
  turmas:[{id:'T1',turma:'1º A'}],
  alunos:[{'id aluno':'A1',nome:'Joana',nascimento:'20/01/2014','id turma':'T1','id responsavel':'R1'}],
  responsaveis:[{id:'R1',nome:'Responsável'}],
  notas:[{'id aluno':'A1',disciplina:'Matemática',bimestre:'1','avaliacao 1':'8,5'}]
 };
 const first=window.BOLT_CLASS_IMPORT.planImport(bundle,sheets);
 const school=first.data.schools[0];
 assert.equal(school.students[0].classId,school.classes[0].id);
 assert.equal(school.students[0].guardian,'Responsável');
 assert.equal(school.students[0].birth,'2014-01-20');
 assert.equal(school.grades[0].score,8.5);
 assert.equal(school.grades[0].publishStatus,'draft');
 assert.equal(window.BOLT_CLASS_IMPORT.planImport({...bundle,data:first.data},sheets).added,0);
});

test('score calculation rejects missing, duplicated and invalid responses',()=>{
 const calc=window.BOLT_GRADE_REVIEW.calculate;
 const result=calc('01 A\n02 B\n03 C','01 A\n02 D\n03 -');
 assert.equal(result.correct,1);
 assert.equal(result.score,3.3);
 assert.throws(()=>calc('01 A\n02 B','01 A'),/mesmas questões/);
 assert.throws(()=>calc('01 A\n01 B','01 A'),/uma vez/);
 assert.throws(()=>calc('01 A\n02 F','01 A\n02 C'),/Cada linha/);
});
